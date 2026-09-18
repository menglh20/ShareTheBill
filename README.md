# 同一屋檐 · ShareTheBill

给留学同居舍友使用的多人记账、分摊和结算网站。前端部署到 **Vercel**，后端部署到 **Railway**。

## 本地运行

需要 Node.js 22.16+（建议使用 Node.js 22 LTS）。

```sh
npm ci
cp .env.example .env
# 修改 .env 的 ADMIN_PASSWORD 和 SESSION_SECRET
npm run dev
```

打开 <http://localhost:5173>。管理员创建账单本后，复制独立链接邀请舍友。开发环境的前端会将 `/api` 请求代理到本机 3001 端口。

本次工作区已生成仅供本地预览的 `.env`：管理员密码为 `roommates-local-2026`。本地演示账本含虚构的舍友和账目；`.env`、演示数据库均不会提交或打包进入部署。

```sh
npm test        # 金额、权限、历史、周期生成及接口集成测试
npm run build  # 生产前端构建
npm start      # 单独启动后端
```

## 已实现的业务规则

- 管理员首页受密码保护；每个账单本具有随机独立链接，链接直接进入身份选择页。
- 身份按账单本独立、名字不可重复（忽略大小写与全半角差异）；可编辑自己的名字、随机头像或上传头像。
- 每本选择 USD 或 CNY；金额以整数分保存，百分比支持两位小数，尾差按最大余数法稳定分配。
- 支出只能以当前身份垫付，可不参与分摊；支持均摊、百分比、具体金额及预设分类。
- 支付记录线下转账，不发起真实付款；允许部分支付和超额支付。
- 个人消费、垫付、已付、已收与净余额，消费分类图，跨成员抵消后的结算建议。
- 每周某天、每月某天、每年某天，在北京时间 00:00 自动生成。短月使用月末；2 月 29 日在非闰年使用 2 月 28 日。新定时器从**下一个**符合规则的日期开始，不追溯创建当天。
- 只有当前身份可修改、删除自己的记录和定时器；数据库保存前后快照及操作人。删除记录保持可见并加删除线，排除余额计算。
- 定时器修改只影响未来账目，成员列表固定。删除某次周期账目不改变定时器；停止定时器保留已有记录。
- 数据更新约每 20 秒刷新一次，窗口重新获得焦点时刷新。表单采用版本检查避免覆盖他人的更新，新增账目和定时器支持重复提交保护。
- 中英文界面，优先手动保存的选择，再匹配浏览器/系统语言，无法匹配时使用中文。电脑侧栏布局，手机单列布局。

身份选择按需求不验证身份所有权：持有账本链接的人可选择任何现有身份。服务端的“只操作自己的”是相对于当前选择的身份执行。管理员密码不用于验证舍友。

## Railway 后端部署

1. 从此 GitHub 仓库创建 Railway 服务；仓库根目录的 `Dockerfile` 用于构建 Node 后端。新服务不再支持旧的 `railway.json`；在服务 Settings 中确认 Builder 使用 Dockerfile、Healthcheck Path 为 `/api/health`、单实例、Restart Policy 为 On Failure（10 次）。
2. 为该服务添加 **Volume**，挂载路径必须为 `/data`。数据库和头像保存在这个持久卷中。
3. 配置以下变量：

| 变量             | 值                                                                |
| ---------------- | ----------------------------------------------------------------- |
| `ADMIN_PASSWORD` | 至少 12 个字符的正式管理员密码，不要使用本地演示密码              |
| `SESSION_SECRET` | 至少 32 个随机字符；可运行下方命令生成                            |
| `APP_URL`        | Vercel 正式网址，如 `https://your-project.vercel.app`，无末尾路径 |
| `DATABASE_PATH`  | `/data/sharethebill.db`（Dockerfile 已设置）                      |
| `NODE_ENV`       | `production`（Dockerfile 已设置）                                 |

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

4. 启用 Railway 的公网域名。访问 `https://你的后端域名/api/health` 应返回 `{"ok":true}`。
5. 保持**一个常驻实例**，不要启用空闲休眠，以便零点按时记账。Railway 重启或短暂中断后，会按原定日期补记遗漏账目；同一定时器、同一日期有唯一约束，不会重复生成。

本项目采用 SQLite + Railway 持久卷，不需要另开数据库服务。不要把数据库放在容器临时文件系统。备份可使用 Railway 的 Volume 备份；对运行中的 SQLite 不应只复制主 `.db` 文件而遗漏 WAL。需要多实例或更高写入吞吐时，再迁移到 PostgreSQL。

## Vercel 前端部署

1. 将同一 GitHub 仓库导入 Vercel，根目录保持仓库根，框架选择 **Vite**。
2. 构建命令 `npm run build`，输出目录 `dist`（`vercel.json` 已配置）。
3. 在 Vercel 项目中设置服务器环境变量：

| 变量      | 值                                                                               |
| --------- | -------------------------------------------------------------------------------- |
| `API_URL` | Railway 后端完整 HTTPS 域名，如 `https://your-api.up.railway.app`，不要带 `/api` |

4. 部署后，把正式 Vercel 网址填写到 Railway 的 `APP_URL`，重启 Railway 服务。
5. 从 Vercel 首页输入正式管理员密码，新建账单本并分享链接。

`api/[...path].js` 将前端同源 `/api` 请求转发到 Railway，因此管理员登录 Cookie 不依赖第三方 Cookie，也不需要在浏览器中暴露后端配置。只有静态页面和同源代理在 Vercel，所有数据库写入与定时任务都由 Railway 执行。

`APP_URL` 必须与实际访问的正式域名一致。要验证独立预览域名，使用单独的预览后端与相应 `APP_URL`，避免让预览版本修改正式账本。

## 文件结构

```text
src/                 React 界面、双语文案和响应式样式
shared/domain.mjs    金额分摊、余额结算、北京时间周期日期
server/app.mjs       Express API、SQLite、身份与审计历史
server/index.mjs     服务入口及周期生成调度
api/[...path].js     Vercel 同源 API 代理
Dockerfile           Railway 后端镜像
vercel.json          Vercel 构建、路由与安全响应头
```

部署参考：[Vercel Node.js Functions](https://vercel.com/docs/functions/runtimes/node-js)、[Railway Volumes](https://docs.railway.com/volumes)、[Railway 当前配置方式](https://docs.railway.com/infrastructure-as-code)、[Node.js SQLite](https://nodejs.org/docs/latest-v22.x/api/sqlite.html)。
