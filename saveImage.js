const qiniu = require('qiniu');
const request = require('request');
const fs = require('fs');
const path = require('path');

const getEtag = require('./qetag');
const config = require('./config');

const MAC = new qiniu.auth.digest.Mac(config.accessKey, config.secretKey);
const UPLOAD_LIMIT_IN_MBYTES = config.UPLOAD_LIMIT_IN_MBYTES;
const QINIU_BUCKET = config.QINIU_BUCKET;

const SERVER = 'http://' + QINIU_BUCKET + '.qiniudn.com/';

/**
 * 转存网络图片到七牛服务器接口
 * @param url 待存储图片的地址
 * @param dir 带存储图片的本地路径
 * @return 成功返回 {url: 七牛云地址}, 失败返回 {error: 错误信息}
 */
var saveImage = function (url, dir) {
  return new Promise((resolve, reject) => {
    if (!url) {
      reject(new Error('URL不能为空'));
    }
    getImageContent(url, (err, content) => {
      if (err) {
        console.error('Failed to get CloudImage data: ' + err);
        // 如果无法获取图片内容，直接删除
        reject(new Error('图片URL无法被访问'));
      }
      if (!content || content.length === 0) {
        console.error('Failed to get image [' + url + '] with zero length');
        reject(new Error('图片URL返回空数据'));
      }
      saveCloudImage(dir, content, function (err, res) {
        if (err) {
          console.warn('Failed to save qiniu image: ' + err);
          reject(new Error('图片云存储失败'));
        } else {
          resolve(SERVER + res.key);
        }
      });
    });
  });
};

function getImageContent(url, cb) {
  // 从URL读取图片
  request({
    url: url,
    encoding: null,
  }, function (err, r, body) {
    if (err) {
      cb(err);
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

/*
 * 将图片内容保存到七牛云并且在本地备份
 *
 * @param {new Buffer | ReadableStream} content 文件内容
 * @param {Function} function(err, { hash: String, url: String }),
 *   第二个参数返回七牛服务器上图片文件的hash和URL
 * 本地文件备份到backup目录，文件名是图片hash值
 * 七牛SDK 参考 http://developer.qiniu.com/docs/v6/sdk/nodejs-sdk.html
 */
var saveCloudImage = function (dir, content, cb) {
  // 计算文件七牛hash值，避免上传重复文件
  getEtag(content, function (name) {
    let key = name + '.jpg';
    //生成上传 Token
    let options = {
      scope: QINIU_BUCKET + ':' + key,
    };
    var putPolicy = new qiniu.rs.PutPolicy(options);
    var uploadToken = putPolicy.uploadToken(MAC);
    let localFile = path.join(dir, key);
    // 上传文件前在本地备份文件
    fs.writeFile(localFile, content, function (err) {
      if (err) {
        return cb(err);
      }
      var config = new qiniu.conf.Config();
      // 空间对应的机房
      //config.zone = qiniu.zone.Zone_z1;
      var formUploader = new qiniu.form_up.FormUploader(config);
      var putExtra = new qiniu.form_up.PutExtra();
      formUploader.putFile(uploadToken, key, localFile, putExtra, function (err,
        respBody, respInfo) {
        if (err) {
          // 上传失败, 处理返回代码
          console.error('Failed to upload qiniu file: ' + err);
          // http://developer.qiniu.com/docs/v6/api/reference/codes.html
          return cb(err);
        }
        // 上传成功
        if (respInfo.statusCode === 200) {
          return cb(null, respBody);
        }
        //console.log(err, respBody, respInfo);
        console.error('图片上传状态', respInfo.statusCode);
        return cb(respBody.error);
      });
    });
  });
};

module.exports = saveImage;