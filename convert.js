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

module.exports = convert;

let str;

async function convert(articles) {
  for (let article of articles) {
    // 获取html格式文章页内容
    let title = article.title;
    let content = article.content;

    // 去除文本中的换行符和空白符
    title = title.replace(/&nbsp;/g, '');
    content = content.replace(/[\r\n]/g, '').replace(/amp;/g, '');

    str = JSON.stringify(content);
    //console.log(str
      //.substr(str.length - 2000, 2000)
    //);

    // simplify the img lable in the body
    let imgReg = /<img.*?data-src="(.*?)".*?width:\s*(\w+).*?>/g;

    /*     // 找出未匹配的图片
        let count = 1;
        console.log(`======开始对文中的图片进行检测======`);
        content.match(/<img.*?>/g).forEach((item) => {
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
    while ((res = imgReg.exec(content)) !== null) {
      //console.log(`替换匹配的第 ${j} 张图片，图片宽度为${res[2]}`);
      count++;
      try {
        let result = await saveImage(res[1], outputImage);
        content = content.replace(res[0], `<img src="${result}?imageView2/2/w/600">`);
        //console.log('图片地址被替换为：', result);
      } catch (e) {
        console.log('图片地址替换失败：', e);
        content = content.replace(res[0], `<img src="${res[1]}?imageView2/2/w/600">`);
      }
      //str = JSON.stringify(content);
      //console.log(str.substr(str.length - 2000, 2000));
    }
    console.log(`==================================`);

    // 文章页内容从html格式转为markdown格式
    content = require('h2m')(content);
    //console.log('当前文章字符数：',content.length);
    str = JSON.stringify(content);
    console.log('文章结尾部分：', str.substr(str.length - 100, 100));
    // 文章页内容本地保存
    fs.writeFile(path.join(outputMD, `${title}.md`), content,
      function (err) {
        if (err) {
          console.error('fail for:', title);
          console.error(err);
        } else {
          console.log('success for:', title);
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