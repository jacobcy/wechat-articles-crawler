module.exports = {
    "extends": "standard",
    // 环境定义了预定义的全局变量。
    "env": {
        //环境定义了预定义的全局变量。更多在官网查看
        "browser": true,
        "node": true,
        "commonjs": true,
        "amd": true,
        "es6": true,
        "mocha": true
    },
    "parser": "babel-eslint",
    // JavaScript 语言选项
    "parserOptions": {
        // ECMAScript 版本
        "ecmaVersion": 6,
        "sourceType": "script", //module
        // 想使用的额外的语言特性:
        "ecmaFeatures": {
            // 允许在全局作用域下使用 return 语句
            "globalReturn": true,
            // impliedStric
            "impliedStrict": true,
            // 启用 JSX
            "jsx": true
        }
    },
    /**
     *  "off" 或 0 - 关闭规则
     *  "warn" 或 1 - 开启规则，使用警告级别的错误：warn (不会导致程序退出),
     *  "error" 或 2 - 开启规则，使用错误级别的错误：error (当被触发的时候，程序会退出)
     */
    "rules": {
        // 数组和对象键值对最后一个逗号， never参数：不能带末尾的逗号, always参数：必须带末尾的逗号，
        // always-multiline：多行模式必须带逗号，单行模式不能带逗号
        "comma-dangle": [1, "always-multiline"],
        "indent": 0,
        "no-spaced-func": 2, //函数调用时 函数名与()之间不能有空格
        "semi": [2, "always"], //语句强制分号结尾
        "semi-spacing": [0, {
            "before": false,
            "after": true
        }], //分号前后空格
        "sort-vars": 0, //变量声明时排序
        "space-after-keywords": [0, "always"], //关键字后面是否要空一格
        "space-before-blocks": [0, "always"], //不以新行开始的块{前面要不要有空格
        "space-before-function-paren": [0, "always"], //函数定义时括号前面要不要有空格
        "space-in-parens": [0, "never"], //小括号里面要不要有空格
        "space-infix-ops": 0, //中缀操作符周围要不要有空格
        "space-unary-ops": [0, {
            "words": true,
            "nonwords": false
        }], //一元运算符的前/后要不要加空格
        "spaced-comment": 0, //注释风格要不要有空格什么的
        "strict": 2, //使用严格模式
        "valid-jsdoc": 0, //jsdoc规则
        "eol-last": 0, //文件以单一的换行符结束
        "no-unused-expressions": 1, // 禁止出现未使用过的表达式
        "no-unused-vars": [1, {
            "vars": "all",
            "args": "after-used"
        }], //不能有声明后未被使用的变量或参数
        "camelcase": 1, //强制驼峰法命名
        "callback-return": 1, //避免多次调用回调什么的
        'standard/no-callback-literal': [0, ["cb", "callback"]],
    }
}