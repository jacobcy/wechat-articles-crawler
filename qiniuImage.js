var qiniu = require('qiniu');
var request = require('request');
var fs = require('fs');
var mkdirp = require('mkdirp');
var path = require('path');

var getEtag = require('./qetag.js');

import {
  accessKey,
  secretKey,
  UPLOAD_LIMIT_IN_MBYTES,
  QINIU_BUCKET,
} from 'config.js'

const IMAGE_PROCESS_SERVER_URL = 'http://' + QINIU_BUCKET + '.qiniudn.com/';

/**
 * 转存网络图片到七牛服务器接口
 * @param url 待存储图片的地址
 * @return 成功返回 {url: 七牛云地址}, 失败返回 {error: 错误信息}
 */
var saveImage = function (url) {
  if (!url) {
    return {
      error: 'URL不能为空'
    }
  }
  CloudImage.addByUrl(url, null, function (err, res) {
    if (err) {
      return {
        error: err
      }
    }
    return {
      result: res
    };
  })
}

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
var saveCloudImage = function (backupName, content, mimeType, cb) {
  var putPolicy = new qiniu.rs.PutPolicy(QINIU_BUCKET);
  var uptoken = putPolicy.token();
  var extra = new qiniu.io.PutExtra();
  extra.mimeType = mimeType;
  // 计算文件七牛hash值，避免上传重复文件
  getEtag(content, function (name) {
    // 上传文件前在本地备份文件
    createLocalImage(backupName, content, function (err) {
      if (err) {
        cb(err);
        return;
      }

      // 上传七牛文件
      qiniu.io.put(uptoken, name, content, extra, function (err, ret) {
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
}

/*
 * 创建本地图片备份，如果图片已经存在直接覆盖。
 * @param {String} filePath
 */
var createLocalImage = function (filePath, content, cb) {
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
    fs.readFile(record.localPath, function (err, data) {
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

// 定时上传图片到七牛云
setInterval(function () {
  if (typeof CloudImage === 'undefined') {
    return;
  }
  if (saving) {
    return;
  }
  saving = true;
  uploadOnePhoto();
}, 500);

function getBackupPath(base, id) {
  return './backup/' + base + '/' + Math.floor(id / 1000) + '/' + id + '.jpg';
}

export {
  uploadImage,
  saveImage
};