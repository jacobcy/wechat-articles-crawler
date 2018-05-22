var qiniu = require('qiniu');
var request = require('request');
var fs = require('fs');
var mkdirp = require('mkdirp');
var path = require('path');

var getEtag = require('./qetag.js');

qiniu.conf.ACCESS_KEY = sails.config.qiniu.AccessKey;
qiniu.conf.SECRET_KEY = sails.config.qiniu.SecretKey;

const UPLOAD_LIMIT_IN_MBYTES = sails.config.qiniu.uploadLimitInMbytes;
const QINIU_BUCKET = sails.config.qiniu.bucket;
const IMAGE_PROCESS_SERVER_URL = 'http://' + QINIU_BUCKET + '.qiniudn.com/';

/*
 * 将图片内容保存到七牛云并且在本地备份
 *
 * @param {new Buffer | ReadableStream} content 文件内容
 * @param {String} mimeType 图片mimeType, 可以是image/png, image/jpeg, image/jpg,
 *   或者image/gif
 * @param {Function} function(err, { hash: String, url: String }),
 *   第二个参数返回七牛服务器上图片文件的hash和URL
 *
 * 本地文件备份到backup目录，文件名是图片hash值
 * 七牛SDK 参考 http://developer.qiniu.com/docs/v6/sdk/nodejs-sdk.html
 */
function saveCloudImage(backupName, content, mimeType, cb) {
  var putPolicy = new qiniu.rs.PutPolicy(sails.config.qiniu.bucket);
  var uptoken = putPolicy.token();
  var extra = new qiniu.io.PutExtra();
  extra.mimeType = mimeType;
  // 计算文件七牛hash值，避免上传重复文件
  getEtag(content, function(name) {
    // 上传文件前在本地备份文件
    createLocalImage(backupName, content, function(err) {
      if (err) {
        cb(err);
        return;
      }
      // 检查是否有相同的远程文件
      CloudImage.findOne({
        remoteUrl: { '!': '' },
        hash: name,
        deleted: false
      }).exec(function(err, found) {
        if (err) {
          cb(err);
          return;
        }
        if (found) {
          cb(null, {
            hash: name,
            url: found.remoteUrl
          });
          return;
        }

        // 上传七牛文件
        qiniu.io.put(uptoken, name, content, extra, function(err, ret) {
          if (err) {
            // 上传失败, 处理返回代码
            console.error('Failed to upload qiniu file: ' + err);
            cb(err);
            // http://developer.qiniu.com/docs/v6/api/reference/codes.html
            return;
          }

          // 检查是否是空图片
          if (ret.hash === 'FvbveVFTw8z_r0XVlOPtD-MyXftg') {
            console.error('[saveCloudImage] Invalid image with zero length generated!');
            cb('zero length image');
            return;
          }
          if (ret.hash != name) {
            console.error('Qiniu file hash not match. ' + name + ' != ' + ret.hash);
            cb('hash not match');
            return;
          }
          // 上传成功
          cb(null, {
            hash: ret.hash,
            url: ret.key
          });
        });
      });
    });
  });
}

/*
 * 创建本地图片备份，如果图片已经存在直接覆盖。
 * @param {String} filePath
 */
function createLocalImage(filePath, content, cb) {
  mkdirp(path.dirname(filePath), function (err) {
    if (err) {
      cb(err);
      return;
    }
    if (fs.exists(filePath)) {
      cb(null);
      return;
    }
    fs.writeFile(filePath, content, cb);
  })
}

function getImageContent(record, cb) {
  // 从本地文件读取图片
  if (record.localPath) {
    fs.readFile(record.localPath, function(err, data) {
      if (err) {
        cb(err);
        return;
      }
      cb(null, data);
    });
    return;
  }

  // 从URL读取图片
  request({
    url: record.sourceUrl,
    encoding: null
  }, function (err, r, body) {
    if (err) {
      cb('[getImageContent] Failed to get image ' + record.sourceUrl + ' with error: ' + err);
      return;
    }
    record.mimeType = r.headers['content-type'];
    if (!record.mimeType || record.mimeType.indexOf('image/') !== 0) {
      cb('[getImageContent] Invalid image with content type of ' + record.mimeType);
      return;
    }
    // TODO: 大图需要压缩成小图片
    // 图片大小限制(单位M)
    if (body.length > UPLOAD_LIMIT_IN_MBYTES * 1024 * 1024) {
      cb('图片应小于' + UPLOAD_LIMIT_IN_MBYTES + 'M');
      return;
    }
    cb(null, body);
  });
}

var saving = false;

function increaseRetries(record) {
  CloudImage.update({ id: record.id }, { retries: record.retries + 1 }).exec(function(err, updated) {
    saving = false;
    if (err) {
      console.warn('Failed to update CloudImage record: ' + err);
      return;
    }
  });
}

// 定时上传图片到七牛云
setInterval(function() {
  if (typeof CloudImage === 'undefined') {
    return;
  }
  if (saving) {
    return;
  }
  saving = true;
  uploadOnePhoto();
}, 500);

// 删除一个无效的照片
// TODO 删除云上照片
function removeOnePhoto() {
  CloudImage.findOne({ deleted: true }).exec(function(err, found) {
    if (err || !found || !found.id) {
      err && console.warn(err);
      saving = false;
      return;
    }

    // 获取待删除图片的hash
    var hash = found.hash;

    // 删除该图片CloudImage记录
    CloudImage.destroy({
      id: found.id
    }).exec(function (err){
      if (err) {
        console.error('Failed to delete CloudImage: ' + err);
        saving = false;
        return;
      }
      if (!hash || !found.localPath) {
        saving = false;
        return;
      }
      // 删除本地备份文件
      fs.unlink(found.localPath, function (err) {
        saving = false;
        err && console.error('error removing local file: ' + err);
      });
    });
  });
}

function getBackupPath(base, id) {
  return './backup/' + base + '/' + Math.floor(id / 1000) + '/' + id + '.jpg';
}

// 上传一个照片到云
function uploadOnePhoto() {
  CloudImage.findOne({
    where: { remoteUrl: '', retries: { '<': 3 }, deleted: false },
    sort: { updatedAt: 0, retries: 1 }
  }).exec(function(err, found) {
    if (err || !found) {
      err && console.warn(err);
      removeOnePhoto();
      return;
    }
    if (!found.sourceUrl && !found.localPath) {
      console.error('Invalid CloudImage record with empty source.');
      // 删除无效数据
      CloudImage.destroy({ found: found.id }).exec(function(err) {
        saving = false;
        if (err) {
          console.log('Failed to delete invalid CloudImage records: ' + err);
        }
      });
      return;
    }
    getImageContent(found, function(err, content) {
      if (err) {
        console.error('Failed to get CloudImage data: ' + err);
        // 如果无法获取图片内容，直接删除
        increaseRetries(found);
        return;
      }
      if (!content || content.length === 0) {
        console.error('[uploadOnePhoto] Failed to get image ' + found.id + ' with zero length');
        increaseRetries(found);
        return;
      }
      var backupName = getBackupPath('photos', found.id);
      saveCloudImage(backupName, content, found.mimeType, function(err, result) {
        if (err) {
          console.warn('Failed to save qiniu image: ' + err);
          increaseRetries(found);
          return;
        }
        CloudImage.findOne({
          hash: result.hash,
          weiboUser: found.weiboUser,
          deleted: false
        }).exec(function(err, found2) {
          if (err) {
            saving = false;
            console.log('Failed to find duplicated CloudImage records: ' + err);
            return;
          }
          // 如果该图片当前用户已经保存过副本，则删除当前图片
          if (found2 && found2.id != found.id) {
            CloudImage.destroy({
              id: found.id
            }).exec(function (err) {
              if (err) {
                saving = false;
                console.log('Failed to remove duplicated CloudImage records: ' + err);
                return;
              }
              // 删除本地备份文件
              fs.unlink(backupName, function (err) {
                saving = false;
                err && console.error('error removing local file: ' + err);
              });
            });
            return;
          }
          // 图片上传成功，保存图片hash和URL
          CloudImage.update(
            { id: found.id },
            { hash: result.hash,
              remoteUrl: result.url,
              localPath: backupName,
              retries: found.retries + 1
            }).exec(function(err) {
            if (err) {
              saving = false;
              console.warn('Failed to update CloudImage record: ' + err);
              return;
            }

            // 如果上传成功的是用户第一张照片，则更新头像(avatar)
            CloudImage.findOne({
              weiboUser: found.weiboUser,
              deleted: false
            }).exec(function(err, first) {
              if (err) {
                saving = false;
                console.error('Failed to find the first photo of a weiboUser: ' + err);
                return;
              }
              if (first.id !== found.id) {
                saving = false;
                return;
              }
              updateAvatar(found.weiboUser, result.url, function(err) {
                if (err) {
                  console.warn('[updateAvatar] ' + err);
                  // 重试一次
                  updateAvatar(found.weiboUser, result.url, function(err) {
                    err && console.warn('[updateAvatar] retry failed' + err);
                    saving = false;
                  });
                  return;
                }
                saving = false;
              });
            });
          });
        });
      });
    });
  });
}

function updateAvatar(userId, firstPhotoUrl, cb) {
  var srcUrl = IMAGE_PROCESS_SERVER_URL + firstPhotoUrl + '?facecrop2/280x280/ignore-error/1';
  // 从URL读取图片
  request({
    url: srcUrl,
    encoding: null
  }, function (err, r, body) {
    if (err) {
      cb('Failed to get image ' + srcUrl + ' with error: ' + err);
      return;
    }
    if (!body || body.length === 0) {
      cb('Failed to get image ' + srcUrl + ' with zero length');
      return;
    }
    var backupName = getBackupPath('avatars', userId);
    // 七牛API有bug content-type 永远是 'text/plain'，这里强制使用'image/jpeg'
    saveCloudImage(backupName, body, 'image/jpeg', function(err, result) {
      if (err) {
        cb('Failed to update avatar image: ' + err);
        return;
      }
      if (!body || body.length === 0) {
        cb('[updateAvatar] Failed to get image ' + srcUrl + ' with zero length');
        return;
      }
      WeiboUser.update(
        { id: userId },
        { avatar: result.url }
      ).exec(function(err, updated) {
        if (err) {
          cb('Failed to update avatar URL: ' + err);
          return;
        }
        cb(null);
      });
    });
  });
}

/**
 * 生成头像并保存
 */
function generateAvatar(userId, url, cb) {
  // 如果是七牛云照片，可以直接生成头像
  var hash = WeiboUser.fromAvatarUrl(url);
  if (hash.indexOf('http') === -1) {
    updateAvatar(userId, hash, cb);
    return;
  }

  // 非七牛云照片，需要先上传到七牛云
  request({
    url: url,
    encoding: null
  }, function (err, r, body) {
    if (err) {
      cb('[generateAvatar] Failed to get image ' + url + ' with error: ' + err);
      return;
    }
    var mimeType = r.headers['content-type'];
    if (!mimeType || mimeType.indexOf('image/') !== 0) {
      cb('[generateAvatar] Invalid image with content type of ' + mimeType);
      return;
    }

    if (!body || body.length === 0) {
      cb('[generateAvatar] Failed to get image ' + url + ' with zero length');
      return;
    }
    var backupName = getBackupPath('generate_avatar', userId);
    saveCloudImage(backupName, body, mimeType, function(err, result) {
      if (err) {
        cb('[generateAvatar] Failed to save qiniu image: ' + err);
        return;
      }
      updateAvatar(userId, result.hash, cb);
    });
  });
}

module.exports = {
  generateAvatar: generateAvatar
};
