import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: {
    tokenExpiration: 2592000,
    // 开启 Payload 原生 API Key：给服务账号（如 cms-bot）在 admin 勾选
    // "Enable API Key" 生成一个不过期、可单独吊销/轮转的 key，供 qlj-skills hub
    // 下发给 cms skill（请求头 Authorization: users API-Key <key>）。
    useAPIKey: true,
  },
  fields: [
    // Email added by default
    // Add more fields as needed
  ],
}
