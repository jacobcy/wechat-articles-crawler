const fs = require('fs');
const path = require('path');
const convert = require('./convert.js');
const output = path.join(__dirname, 'out_files');

(function () {
  fs.readFile(path.join(output, 'result.json'), (err, data) => {
    if (err) {
      console.err(err);
      return;
    }
    if (!data) {
      console.err('文件内容为空，退出!');
      return;
    }
    let articles = JSON.parse(data);
    convert(articles);
  });
}());