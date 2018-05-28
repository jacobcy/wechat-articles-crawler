const ip = require('ip').address();
const saveImage = require('./saveImage');

const fs = require('fs');
const path = require('path');

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
// require("openurl").open("http://localhost:9000")

let articles = [];
let index = 0;
let wechatIo = io.of('/wechat');
let resultIo = io.of('/result');

wechatIo.on('connection', (socket) => {
  socket.on('crawler', async (crawData) => {
    crawData.crawTime = require('moment')().format('YYYY-MM-DD HH:mm');
    let newData;
    if (articles[index]) {
      newData = Object.assign({
        otitle: articles[index].title,
        ourl: articles[index].content_url,
        author: articles[index].author,
      }, crawData);
    } else {
      newData = Object.assign({
        otitle: '这是一篇测试文章',
      }, crawData);
    }
    // 获取html格式文章页内容
    let content = newData.content;

    // simplify the img lable in the body
    let imgReg = /<img[\s\S]*?data-src="([\s\S]*?)"[\s\S]*?width:\s*(\w+)[\s\S]*?>/g;

      // 找出未匹配的图片
      for (let i of content.match(/<img[\s\S]*?>/g)) {
        if (!imgReg.test(i)) {
          console.log('该图片没有成功匹配：', i);
        }
      }

    let res;
    let j = 1;
    while ((res = imgReg.exec(content)) !== null) {
      try {
        let result = await saveImage(res[1], outputImage);
        console.log(`这是文章中的第 ${j} 张图片`);
        console.log('图片地址为：', result);
        console.log('图片宽度为：', res[2]);
        j++;
        content = content.replace(res[0], `<img src="${result}?imageView2/2/w/600">`);
      } catch (e) {
        console.log(e);
        content = content.replace(res[0], `<img src="${res[1]}?imageView2/2/w/600">`);
      }
    }
    // 文章页内容从html格式转为markdown格式
    content = require('h2m')(content);
    // 文章页内容本地保存
    console.log('开始保存页面');
    fs.writeFile(path.join(outputMD, `${newData.otitle}.md`), content,
      function (err) {
        if (err) {
          console.error('fail for:', newData.otitle);
          console.error(err);
        } else {
          console.log('success for:', newData.otitle);
          socket.emit('success');
          resultIo.emit('newData', newData);
        }

        index++;
        // 检查是否有待抓取的文章
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

  socket.on('noData', () => {
    if (!articles[index].content_url) {
      socket.emit('end', {});
    }
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
 * inject code.
 * @param {string} body 注入代码
 * @return {string} 替换内容
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
const maxLength = 1;

module.exports = {
  summary: 'wechat articles crawler',

  * beforeSendRequest(requestDetail) {
    // 如果请求图片，直接返回一个本地图片，提升性能
    let accept = requestDetail.requestOptions.headers.Accept;
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
      console.log('get profile_ext',
        responseDetail.response.header['Content-Type']);

      const newResponse = responseDetail.response;
      let body = responseDetail.response.body.toString();
      let newAdd = [];
      let canMsgContinue = true;

      if (responseDetail.response.header['Content-Type']
        .indexOf('text/html') !== -1) {
        let msgReg = /var msgList = '(.*?)';/;

        let execBody = msgReg.exec(body)[1];
        let execRes = execBody.replace(/&quot;/g, '"');
        let msgList = JSON.parse(execRes);
        // JSON.parse(msgReg.exec(body)[1])

        msgList.list.forEach((v, i) => {
          if (v.app_msg_ext_info) {
            v.app_msg_ext_info.del_flag !== 4 &&
              v.app_msg_ext_info.content_url &&
              newAdd.push(
                Object.assign({}, v.app_msg_ext_info, v.comm_msg_info)
              );
            let subList = (v.app_msg_ext_info &&
              v.app_msg_ext_info.multi_app_msg_item_list) || [];
            subList.forEach((v1) => {
              v1.del_flag !== 4 && v1.content_url &&
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
        header.Expires = 0;
        header['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        newResponse.header = header;
      } else {
        canMsgContinue =
          body.indexOf('can_msg_continue":1') !== -1;

        let regList = /general_msg_list":"(.*)","next_offset/;

        let list = regList.exec(body)[1];

        let reg = /\\"/g;

        let generalMsgList = JSON.parse(list.replace(reg, '"'));

        generalMsgList.list.forEach((v, i) => {
          if (v.app_msg_ext_info) {
            v.app_msg_ext_info.del_flag !== 4 &&
              v.app_msg_ext_info.content_url &&
              newAdd.push(
                Object.assign({}, v.app_msg_ext_info, v.comm_msg_info)
              );
            let subList = (v.app_msg_ext_info &&
              v.app_msg_ext_info.multi_app_msg_item_list) || [];
            subList.forEach((v1) => {
              v1.del_flag !== 4 && v1.content_url &&
                newAdd.push(Object.assign({}, v1, v.comm_msg_info));
            });
          }
        });
      }

      newAdd.forEach((v) => {
        v.content_url = v.content_url.replace(/amp;/g, '').replace(/\\\//g, '/').replace('#wechat_redirect', '');
      });

      if (articles.length <= maxLength) {
        articles = articles.concat(newAdd);
      }
      console.log('获取文章的列表总数articles.length ', articles.length);

      if (!canMsgContinue || articles.length > maxLength) {
        fetchListEndStartArticle();
      }

      return {
        response: newResponse,
      };
    } else if (

      requestDetail.url.indexOf('mp.weixin.qq.com/mp/getappmsgext?') !== -1 &&
      requestDetail.requestOptions.method === 'POST') {
      // 获取评论数，点赞数

    } else if (requestDetail.url.indexOf('mp.weixin.qq.com/s?') !== -1 &&
      requestDetail.requestOptions.method === 'GET') {
      // 文章内容
      const newResponse = responseDetail.response;
      let body = responseDetail.response.body.toString();

      newResponse.body = injectJquery(body)
        .replace(/\s<\/body>\s/g, articleInjectJs + '</body>');

      let header = Object.assign({}, responseDetail.response.header);
      // 删除微信的安全策略，禁止缓存
      delete header['Content-Security-Policy'];
      delete header['Content-Security-Policy-Report-Only'];
      header.Expires = 0;
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

function fetchListEndStartArticle() {
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
};