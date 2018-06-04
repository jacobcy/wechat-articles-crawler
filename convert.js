const fs = require('fs');
const path = require('path');
const saveImage = require('./saveImage');
const domain = 'http://bghunt.cn/author/';
const jieba = require('nodejieba');

let str;
module.exports = convert;

// 自动创建输出文件夹
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

// 获取文章发布的时间
function formatDate(ns) {
  var d = new Date(parseInt(ns) * 1000);
  //console.log(d);
  var dformat = [d.getFullYear(), d.getMonth() + 1, d.getDate()].join('-') +
    ' ' + [d.getHours(), d.getMinutes(), d.getSeconds()].join(':');
  return dformat;
}

// module.exports = getKewwords;
// 获取文章的关键词，排除文章作者
function getKewwords(author, content) {
  let keyResult = [];
  let keywords = jieba.extract(content, 50);
  str = JSON.stringify(keywords);
  // console.log(str);
  let tagBlackList = ['中国', '东西', '中西', '共和国', '城镇', '两国', '中华', '论文', '工作'];
  let attrAllow = ['vn', 'nr', 'nrt', 'ns', 'nt', 'nz', 'l', 'j'];
  for (let k of keywords) {
    let word = k.word;
    let attr = jieba.tag(word)[0].tag;
    // console.log('=====');
    // console.log('关键词判断：', word, attr);
    if (author.indexOf(word) !== -1) {
      // console.log(word, ':可能是作者，排除!');
      continue;
    }
    if (attrAllow.indexOf(attr) === -1) {
      // console.log(word, '词性是', attr, ',排除!');
      continue;
    }
    if (tagBlackList.indexOf(word) !== -1) {
      // console.log(word, ':不在名单中，排除!');
      continue;
    }
    // console.log(word, ':符合条件，通过!');
    keyResult.push(word);
  }
  // console.log(keyResult.toString());
  return keyResult;
}

// 将html文章内容处理为md格式文章
async function convert(articles) {
  if (!articles) {
    console.error('没有需要转换的内容，end!');
    return;
  }

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

    if (!article.content) {
      console.error(`fail for: ${article.title},内容为空!`);
      return;
    }

    article.keywords = getKewwords(article.author, article.content);
    let keywords = '';
    for (let i = 0; i < 5; i++) {
      if (!article.keywords[i]) {
        break;
      }
      keywords = keywords +
        `
  - ${article.keywords[i]}`;
    }

    let outputContent =
      `
---
title: ${article.title}
subtitle: ${article.digest}
author: ${article.author || 'Admin'}
editor: 
  name: ${article.postUser || article.author || 'Admin'}
  link: ${article.content_url}
date: ${formatDate(article.datetime)}
crawTime: ${article.crawTime}
cover: ${article.cover}
likeNum: ${article.likeNum}
readNum: ${article.readNum}
source_url: ${article.source_url}
raw_url: ${article.content_url}
categories: 
tags: ${keywords}
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

  let outputJson = JSON.stringify(articles, null, '\t');
  //console.log(outputJson);
  fs.writeFile(path.join(output, 'result.json'), outputJson, function (err) {
    if (err) {
      return console.error(err);
    }
    console.log('数据写入成功!', output);
  });
};