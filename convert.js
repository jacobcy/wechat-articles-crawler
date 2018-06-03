const fs = require('fs');
const path = require('path');
const saveImage = require('./saveImage');
const domain = 'http://bghunt.cn/author/';
const jieba = require('nodejieba');

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
const outputHtml = getSub(output, 'html');
const outputImage = getSub(output, 'Image');

function formatDate(ns) {
  var d = new Date(parseInt(ns) * 1000);
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
        str = await saveImage(article.cover, outputImage);
        article.cover = str + '?imageMogr2/crop/x500';
      } catch (e) {
        console.warn('文章封面图替换失败：', e);
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
            console.error('该图片没有成功匹配：', item);
          }
        });
        console.log(`==================================`); */

    let res;
    let count = 1;
    //console.log(`======开始对文中的图片进行替换======`);
    while ((res = imgReg.exec(article.content)) !== null) {
      count++;
      try {
        let result = await saveImage(res[1], outputImage);
        article.content = article.content.replace(res[0], `<img src="${result}?imageView2/2/w/600">`);
        // console.log(`第 ${count} 张图片替换成功，图片宽度为${res[2]}`);
      } catch (e) {
        console.warn(`第 ${count} 张图片替换失败：`, e);
        article.content = article.content.replace(res[0], `<img src="${res[1]}?imageView2/2/w/600">`);
      }
      //str = JSON.stringify(article.content);
      //console.log('-----文章结尾部分-----\n', str.substr(str.length - 2000, 2000));
    }
    console.log(`==================================`);

    /*     await fs.writeFile(path.join(outputHtml, `${article.title}.html`), article.content,
        function (err) {
          if (err) {
            console.error('fail for:', article.title);
            console.error(err);
          } else {
            console.log('success for:', article.title);
          }
        }); */

    // 文章页内容从html格式转为markdown格式
    article.content = require('h2m')(article.content);
    //console.log('文章字符数：',article.content.length);
    //str = JSON.stringify(article.content);
    //console.log('-----文章结尾部分-----\n', str.substr(str.length - 1000, 1000));

    article.keywords = [];
    let keywords = await jieba.extract(article.content, 20);
    let tagBlackList = ['学生', '学者', '老师', '名校', '大学', '文章', '一个', '一位', '一块', '少年', '小孩', '能够'];
    let attrAllow = ['n', 'v'];
    for (let k of keywords) {
      let word = k.word;
      let attr = jieba.tag(word)['tag'];
      if (article.author.indexOf(word)) {
        continue;
      }
      if (attrAllow.indexOf(attr) === -1) {
        continue;
      }
      if (tagBlackList.indexOf(word) === -1) {
        article.keywords.push(word);
      }
    }
    console.log(article.keywords.toString());

    let outputContent =
      `
---
title: ${article.title}
subtitle: ${article.digest}
author: ${article.author || '中华好学者'}
editor: 
  name: ${article.postUser || article.author || '中华好学者'}
  link: ${article.content_url}
date: ${formatDate(article.postDate)}
crawTime: ${article.crawTime}
cover: ${article.cover}
likeNum: ${article.likeNum}
readNum: ${article.readNum}
source_url: ${article.source_url}
source_wechat: ${article.content_url}
categories: 
tags: 
  - ${article.keywords[0]}
  - ${article.keywords[1]}
  - ${article.keywords[2]}
comments: true
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