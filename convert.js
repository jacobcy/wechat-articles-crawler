const fs = require('fs');
const path = require('path');
const saveImage = require('./saveImage');

function getSub(output, dir) {
  let target = path.join(output, dir);
  try {
    fs.accessSync(target);
  } catch (e) {
    fs.mkdirSync(target);
  }
  return target;
}
const output = getSub(__dirname, 'out_files');
const outputMD = getSub(output, 'MD');
const outputImage = getSub(output, 'Image');

function formatDate(ns) {
  var d = new Date(ns);
  var dformat = [d.getFullYear(), d.getMonth() + 1, d.getDate()].join('-') +
    ' ' + [d.getHours(), d.getMinutes(), d.getSeconds()].join(':');
  return dformat;
}

module.exports = convert;

let str;

async function convert(articles) {
  for (let article of articles) {
    //首先处理封面
    if (article.cover) {
      try {
        article.cover = await saveImage(article.cover, outputImage);
      } catch (e) {
        console.error(e);
        article.cover = '';
      }
    }

    //str = JSON.stringify(article.content);
    //console.log(str
    //.substr(str.length - 2000, 2000)
    //);

    // simplify the img lable in the body
    let imgReg = /<img.*?data-src="(.*?)".*?width:\s*(\w+).*?>/g;

    /*     // 找出未匹配的图片
        let count = 1;
        console.log(`======开始对文中的图片进行检测======`);
        article.content.match(/<img.*?>/g).forEach((item) => {
          console.log(`这是文章中的第 ${count} 张图片`);
          count++;
          if (!imgReg.test(item)) {
            console.log('该图片没有成功匹配：', item);
          }
        });
        console.log(`==================================`); */

    let res;
    let count = 1;
    //console.log(`======开始对文中的图片进行替换======`);
    while ((res = imgReg.exec(article.content)) !== null) {
      console.log(`替换匹配的第 ${count} 张图片，图片宽度为${res[2]}`);
      count++;
      try {
        let result = await saveImage(res[1], outputImage);
        article.content = article.content.replace(res[0], `<img src="${result}?imageView2/2/w/600">`);
        //console.log('图片地址被替换为：', result);
      } catch (e) {
        console.log('图片地址替换失败：', e);
        article.content = article.content.replace(res[0], `<img src="${res[1]}?imageView2/2/w/600">`);
      }
      //str = JSON.stringify(article.content);
      //console.log(str.substr(str.length - 2000, 2000));
    }
    console.log(`==================================`);

    // 文章页内容从html格式转为markdown格式
    article.content = require('h2m')(article.content);
    //console.log('当前文章字符数：',article.content.length);
    //str = JSON.stringify(article.content);
    //console.log('文章结尾部分：', str.substr(str.length - 100, 100));

    //str = JSON.stringify(article);
    //console.log(article);
    let outputContent =
      `
---
title: ${article.title}
author: ${article.author}
date: ${formatDate(article.postDate)}
crawTime: ${article.crawTime}
cover: ${article.cover}
likeNum: ${article.likeNum}
readNum: ${article.readNum}
source_url: ${article.source_url}
source_wechat: ${article.content_url}
categories: 
tags: 
---
${article.digest}
<!--more-->
${article.content}
    `;
    // 文章页内容本地保存
    fs.writeFile(path.join(outputMD, `${article.title}.md`), outputContent,
      function (err) {
        if (err) {
          console.error('fail for:', article.title);
          console.error(err);
        } else {
          console.log('success for:', article.title);
        }
      });
  };

  fs.writeFile(path.join(output, 'result.json'),
    JSON.stringify(articles, null, '\t'),
    function (err) {
      if (err) {
        return console.error(err);
      }
      console.log('数据写入成功!', output);
    });
};