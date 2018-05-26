var qiniu = require('qiniu');
var request = require('request');
var fs = require('fs');
var path = require('path');

var getEtag = require('./qetag.js');

import {
  accessKey,
  secretKey,
  UPLOAD_LIMIT_IN_MBYTES,
  QINIU_BUCKET,
} from 'config.js'

qiniu.conf.ACCESS_KEY = accessKey;
qiniu.conf.SECRET_KEY = secretKey;

const IMAGE_PROCESS_SERVER_URL = 'http://' + QINIU_BUCKET + '.qiniudn.com/';

/**
 * 转存网络图片到七牛服务器接口
 * @param url 待存储图片的地址
 * @return 成功返回 {url: 七牛云地址}, 失败返回 {error: 错误信息}
 */
var saveImage = function (url, dir, cb) {
  if (!url) {
    cb('URL不能为空');
    return;
  }
  getImageContent(url, function (err, content, mimeType) {
    if (err) {
      console.error('Failed to get CloudImage data: ' + err);
      // 如果无法获取图片内容，直接删除
      cb('图片URL无法被访问')
      return;
    }
    if (!content || content.length === 0) {
      console.error('Failed to get image [' + url + '] with zero length');
      cb('图片URL返回空数据');
      return;
    }
    saveCloudImage(dir, content, mimeType, function (err, res) {
      if (err) {
        console.warn('Failed to save qiniu image: ' + err);
        cb('图片云存储失败');
        return;
      }
      cb(null, res.url);
    });
  })
}

function getImageContent(url, cb) {
  // 从URL读取图片
  request({
    url: url,
    encoding: null
  }, function (err, r, body) {
    if (err) {
      cb(err);
      return;
    }
    mimeType = r.headers['content-type'];
    if (!mimeType || mimeType.indexOf('image/') !== 0) {
      cb('Invalid image with content type of ' + mimeType);
      return;
    }
    // TODO: 大图需要压缩成小图片
    // 图片大小限制(单位M)
    if (body.length > UPLOAD_LIMIT_IN_MBYTES * 1024 * 1024) {
      cb('图片应小于' + UPLOAD_LIMIT_IN_MBYTES + 'M');
      return;
    }
    cb(null, body, mimeType);
  });
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
var saveCloudImage = function (dir, content, mimeType, cb) {
  var putPolicy = new qiniu.rs.PutPolicy(QINIU_BUCKET);
  var uptoken = putPolicy.token();
  var extra = new qiniu.io.PutExtra();
  extra.mimeType = mimeType;
  // 计算文件七牛hash值，避免上传重复文件
  getEtag(content, function (name) {
    let backupName = path.join(dir, name + '.jpg');
    // 上传文件前在本地备份文件
    fs.writeFile(backupName, content, function (err) {
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

module.exports = saveImage;