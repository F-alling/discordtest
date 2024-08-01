import { uploadMedia, deleteFile } from '../base/media/upload.mjs'
import config from '../base/config.mjs'
import AlphabeticID from './id.mjs'

export default class IndexPost {
  constructor(opts = {}) {
    Object.assign(this, {
      frontend: opts.frontend,
      uploadMedia: uploadMedia,
      deleteFile: deleteFile,
    })
  }

  register(server) {
    this.serve = server.routes.serve
    server.flaska.post('/', [
      server.formidable({ maxFileSize: 8 * 1024 * 1024, }),
    ], this.createNewLink.bind(this))
    server.flaska.get('/video/:id', this.videoRedirect.bind(this))
  }

  async videoRedirect(ctx) {
    try {
      let id = AlphabeticID.decode(ctx.params.id.slice(0,-5))
      let videoLink = null
      if (id) {
        let res = await ctx.db.safeCallProc('discord_embed.link_get', [id - 3843])
        if (res.first.length) {
          videoLink = res.first[0].video_link
        } else {
          ctx.status = 404
        }
      }

      if (videoLink) {
        ctx.status = 302
        ctx.headers['Location'] = videoLink
        ctx.type = 'text/html; charset=utf-8'
        ctx.body = `
Redirecting
<a href="${videoLink}">Click here if it doesn't redirect</a>
`
        return
      } else {
        ctx.status = 404
        ctx.state.error = 'Video not found.'
      }
    } catch (err) {
      ctx.log.error(err, 'Unable to fetch resource ' + ctx.url.slice(1))
      ctx.state.error = 'Unknown error while fetching link.'
    }
    return this.serve.serveIndex(ctx)
  }

  hasErrors(ctx, hasMedia) {
    if (!ctx.req.body.video) {
      return 'Missing video link'
    }

    if (!ctx.req.body.video.startsWith('http')) {
      return 'Video link has to be a valid full url'
    }
    
    if (ctx.req.body.image) {
      if (!ctx.req.body.image.startsWith('http')) {
        return 'Image link has to be a valid full url'
      }
    }
  }

  async getLink(ctx) {
    
    return this.serve.serveIndex(ctx)
  }

  /** POST: / */
  async createNewLink(ctx) {
    ctx.state.video = ctx.req.body.video
    ctx.state.image = ctx.req.body.image || 'https://cdn.nfp.is/av1/empty.png'

    let rateLimited = false
    let redisKey = 'ratelimit_' + ctx.req.ip.replace(/:/g, '-')

    try {
      let val = (await ctx.redis.get(redisKey))
      val = val && Number(val) || 0
      if (val > 3) {
        rateLimited = true
      } else if (val > 2) {
        await ctx.redis.setex(redisKey, 60 * 15, val + 1)
        rateLimited = true
      } else {
        await ctx.redis.setex(redisKey, 15, val + 1)
      }
    } catch (err) {
      ctx.log.error(err, 'Error checking rate limit for ' + redisKey)
    }

    if (rateLimited) {
      ctx.state.error = 'You have reached rate limit. Please wait at least 15 minutes.'
      return this.serve.serveIndex(ctx)
    }

    let hasMedia = ctx.req.files.media && ctx.req.files.media.size
    let redirect = ''
    let error = this.hasErrors(ctx, hasMedia)

    if (!error && hasMedia) {
      try {
        let temp = await this.uploadMedia(ctx.req.files.media)
        ctx.state.image = ctx.req.body.image = 'https://cdn.nfp.is' + temp.sizes.small.jpeg.path

        await this.deleteFile(temp.filename).catch(err => {
          ctx.log.error(err, 'Error removing ' + temp.filename)
        })
      }
      catch (err) {
        ctx.log.error(err)
        error = 'Unable to upload file: ' + err.message
      }
    }
    if (!error) {
      redirect = `${this.frontend}/?v=${ctx.state.video}&i=${ctx.state.image}`
    }

    if (!error) {
      try {
        let params = [
          ctx.state.video,
          ctx.state.image,
          ctx.req.ip,
        ]
        let res = await ctx.db.safeCallProc('discord_embed.link_add', params)
        let id = AlphabeticID.encode(res.first[0].id + 3843)
        redirect = `${this.frontend}/${id}`
      }
      catch (err) {
        ctx.log.error(err)
        error = 'Error while generating shortened link.'
      }
    }

    if (redirect && !error) {
      ctx.status = 302
      ctx.headers['Location'] = redirect
      ctx.type = 'text/html; charset=utf-8'
      ctx.body = `
Redirecting
<a href="${redirect}">Click here if it doesn't redirect</a>
`
    }
    ctx.state.error = error
    return this.serve.serveIndex(ctx)
  }
}
// https://litter.catbox.moe/cnl6hy.mp4