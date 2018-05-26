const ip = require('ip').address();
const saveImage = ('saveImage.js');

const fs = require('fs');
const path = require('path');

function getSub(output, dir){
  target = path.join(output, dir)
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

const Koa = require('koa');
const app = new Koa();
const server = require('http').createServer(app.callback());
const io = require('socket.io')(server);

const Router = require('koa-router');
const router = new Router();

// error handle
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (e) {
    console.log('error', e, ctx);
    app.emit('error', e, ctx);
  }
});

app.use(require('koa2-cors')());

router.get('/', async (ctx, next) => {
  ctx.body = fs.readFileSync('result.html', 'utf-8');
});

app.use(router.routes());

server.listen(9000);
// require("openurl").open("http://localhost:9000");

let articles = [];
let index = 0;
let wechatIo = io.of('/wechat');
let resultIo = io.of('/result');

wechatIo.on('connection', (socket) => {
  socket.on('crawler', (crawData) => {
    crawData.crawTime = require('moment')().format('YYYY-MM-DD HH:mm');

    let newData = Object.assign({
      otitle: articles[index].title,
      ourl: articles[index].content_url,
      author: articles[index].author,
    }, crawData);

    let content = newData.content;

    // simplify the img lable in the body 
    let imgReg = /<img[\s\S]*?data-src="(.*?)"[\s\S]*?width:\s*(\w+)[\s\S]*?>/g;
    while (true) {
      let res = imgReg.exec(content);
      if (!res) {
        break;
      }
      saveImage(res[1], outputImage, function (err, result) {
        if (err) {
          console.log(err);
          continue;
        }
        content.replace(res[0], `<img src="${result}?imageView2/2/w/${res[2]}">`)
      });
    }

    content = require('h2m')(content);
    fs.writeFile(path.join(outputMD, `${newData.otitle}.md`), content,
      function (err) {
        if (err) {
          return console.error(err);
        }
        console.log('success for:', newData.otitle);
      });

    socket.emit('success');
    resultIo.emit('newData', newData);
    index++;

    if (articles[index]) {
      socket.emit('url', {
        url: articles[index].content_url,
        index: index,
        total: articles.length,
      });
    } else {
      socket.emit('end', {});
    }
  });

  socket.on('noData', (crawData) => {
    console.warn(' 超时没有爬取到？ url: ', articles[index].content_url);
    index++;

    if (articles[index]) {
      socket.emit('url', {
        url: articles[index].content_url,
        index: index,
        total: articles.length,
      });
    } else {
      socket.emit('end', {});
    }
  });
});

const jqueryFile = fs.readFileSync('jquery.min.js', 'utf-8');
const socketFile = fs.readFileSync('socket.io.js', 'utf-8');

/**
 * @parm {String} 在页面中注入代码
 */
function injectJquery(body) {
  return body.replace(/<\/head>/g, `<script>${jqueryFile}</script><script>
    ${socketFile}</script></head>`);
}

const injectJsFile = fs.readFileSync('injectJs.js', 'utf-8')
  .replace('{$IP}', ip);
const articleInjectJsFile = fs.readFileSync('articleInjectJs.js', 'utf-8')
  .replace('{$IP}', ip);
let injectJs = `<script id="injectJs" type="text/javascript">
    ${injectJsFile}</script>`;
let articleInjectJs = `<script id="injectJs" type="text/javascript">
    ${articleInjectJsFile}</script>`;
const fakeImg = fs.readFileSync('fake.png');
const maxLength = 30;

module.exports = {
  summary: 'wechat articles crawler',

  * beforeSendRequest(requestDetail) {
    // 如果请求图片，直接返回一个本地图片，提升性能
    let accept = requestDetail.requestOptions.headers['Accept'];
    if (accept && accept.indexOf('image') !== -1 &&
      requestDetail.url.indexOf('mmbiz.qpic.cn/') !== -1) {
      return {
        response: {
          statusCode: 200,
          header: {
            'content-type': 'image/png',
          },
          body: fakeImg,
        },
      };
    }
  },

  * beforeSendResponse(requestDetail, responseDetail) {
    // 历史文章列表
    if (requestDetail.url.indexOf('mp.weixin.qq.com/mp/profile_ext?') !== -1 &&
      requestDetail.requestOptions.method === 'GET') {
      console.log('get  profile_ext',
        responseDetail.response.header['Content-Type']);

      const newResponse = responseDetail.response;
      let body = responseDetail.response.body.toString();
      let newAdd = [];
      let canMsgContinue = true;

      if (responseDetail.response.header['Content-Type']
        .indexOf('text/html') !== -1) {
        let msgReg = /var msgList = \'(.*?)\';/;

        let execBody = msgReg.exec(body)[1];
        let msgList = JSON.parse(execBody.replace(/&quot;/g, '"'));
        // JSON.parse(msgReg.exec(body)[1]);

        msgList.list.forEach((v, i) => {
          if (v.app_msg_ext_info) {
            v.app_msg_ext_info.del_flag != 4 &&
              v.app_msg_ext_info.content_url &&
              newAdd.push(
                Object.assign({}, v.app_msg_ext_info, v.comm_msg_info)
              );
            let subList = (v.app_msg_ext_info &&
              v.app_msg_ext_info.multi_app_msg_item_list) || [];
            subList.forEach((v1) => {
              v1.del_flag != 4 && v1.content_url &&
                newAdd.push(
                  Object.assign({}, v1, v.comm_msg_info));
            });
          }
        });

        newResponse.body = injectJquery(body).replace(/<\/body>/g,
          injectJs + '</body>');

        let header = Object.assign({}, responseDetail.response.header);
        // 删除微信的安全策略，禁止缓存
        delete header['Content-Security-Policy'];
        delete header['Content-Security-Policy-Report-Only'];
        header['Expires'] = 0;
        header['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        newResponse.header = header;
      } else {
        canMsgContinue =
          body.indexOf('canMsgContinue":1') !== -1;

        let regList = /generalMsgList":"(.*)","next_offset/;

        let list = regList.exec(body)[1];

        let reg = /\\"/g;

        let generalMsgList = JSON.parse(list.replace(reg, '"'));

        generalMsgList.list.forEach((v, i) => {
          if (v.app_msg_ext_info) {
            v.app_msg_ext_info.del_flag != 4 &&
              v.app_msg_ext_info.content_url &&
              newAdd.push(
                Object.assign({}, v.app_msg_ext_info, v.comm_msg_info)
              );
            let subList = (v.app_msg_ext_info &&
              v.app_msg_ext_info.multi_app_msg_item_list) || [];
            subList.forEach((v1) => {
              v1.del_flag != 4 && v1.content_url &&
                newAdd.push(Object.assign({}, v1, v.comm_msg_info));
            });
          }
        });
      }

      newAdd.forEach((v) => {
        v.content_url = v.content_url.replace(/amp;/g, '')
          .replace(/\\\//g, '/').replace('#wechat_redirect', '');
      });


      if (articles.length <= maxLength) {
        articles = articles.concat(newAdd);
      }
      console.log('获取文章的列表总数articles.length ', articles.length);

      if (!canMsgContinue || articles.length > maxLength) {
        fetchListEnd_StartArticle();
      }

      return {
        response: newResponse,
      };
    } else if (
      requestDetail.url.indexOf('mp.weixin.qq.com/mp/getappmsgext?') !== -1 &&
      requestDetail.requestOptions.method == 'POST') {
      // 获取评论数，点赞数

    } else if (requestDetail.url.indexOf('mp.weixin.qq.com/s?') !== -1 &&
      requestDetail.requestOptions.method == 'GET') {
      // 文章内容
      const newResponse = responseDetail.response;
      let body = responseDetail.response.body.toString();

      newResponse.body = injectJquery(body)
        .replace(/\s<\/body>\s/g, articleInjectJs + '</body>');

      let header = Object.assign({}, responseDetail.response.header);
      // 删除微信的安全策略，禁止缓存
      delete header['Content-Security-Policy'];
      delete header['Content-Security-Policy-Report-Only'];
      header['Expires'] = 0;
      header['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      newResponse.header = header;

      return {
        response: newResponse,
      };
    }
  },
  * beforeDealHttpsRequest(requestDetail) {
    return true;
  },
};

/**
 */
function fetchListEnd_StartArticle() {
  console.log('最终获取文章的列表总数： ', articles.length);
  wechatIo.emit('url', {
    url: articles[0].content_url,
    index: 0,
    total: articles.length,
  });

  fs.writeFile(path.join(output, 'result.json'),
    JSON.stringify(articles, null, '\t'),
    function (err) {
      if (err) {
        return console.error(err);
      }
      console.log('数据写入成功!', output);
    });
}

/**
 */
function resetData() {
  index = 0;
  articles = [];
}