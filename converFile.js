    const fs = require('fs');
    const path = require('path');
    const convert = require('./convert.js');
    const output = path.join(__dirname, 'out_files');

    try {
      let articles = fs.readFileSync(path.join(output, 'result.json'));
      articles = JSON.parse(articles);
      convert(articles);
    } catch (e) {
      console.log(e);
    }