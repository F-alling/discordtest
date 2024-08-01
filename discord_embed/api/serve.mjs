import path from 'path'
import { HttpError } from 'flaska'
import Parent from '../base/serve.mjs'
import fs from 'fs/promises'
import fsSync from 'fs'
import dot from 'dot'
import config from '../base/config.mjs'
import AlphabeticID from './id.mjs'

export default class ServeHandler extends Parent {
  loadTemplate(indexFile) {
    this.template = dot.template(indexFile.toString(), { argName: [
      'imageLink',
      'videoLink',
      'error',
      'siteUrl',
      'siteUrlBase',
      'version',
      'nonce',
      'in_debug',
      'inputVideo',
      'inputImage'
    ], strip: false })
  }

  register(server) {
    super.register(server)
    server.flaska.onerror(this.serveError.bind(this))
  }

  serveError(err, ctx) {
    ctx.log.error(err)

    if (err instanceof HttpError) {
      ctx.status = err.status
      ctx.state.error = err.message
    } else {
      ctx.status = 500
      ctx.state.error = 'Unknown error occured'
    }
    
    let videoLink = ctx.query.get('v') || ''
    let imageLink = ctx.query.get('i') || ''

    ctx.body = this.template({
      videoLink: videoLink,
      imageLink: imageLink,
      error: ctx.state.error || '',
      inputVideo: ctx.state.video || videoLink || '',
      inputImage: ctx.state.image || imageLink || '',
      siteUrl: this.frontend + ctx.url,
      siteUrlBase: this.frontend + '/',
      version: this.version,
      nonce: ctx.state.nonce,
      in_debug: config.get('NODE_ENV') === 'development' && false,
    })
    ctx.type = 'text/html; charset=utf-8'
  }

  async serveIndex(ctx) {
    if (config.get('NODE_ENV') === 'development') {
      let indexFile = await fs.readFile(path.join(this.root, 'index.html'))
      this.loadTemplate(indexFile)
    }

    let videoLink = ctx.query.get('v') || ''
    let imageLink = ctx.query.get('i') || (videoLink ? 'https://cdn.nfp.is/av1/empty.png' : '')

    if (!ctx.state.error) {
      if (ctx.url.match(/^\/[a-zA-Z0-9][a-zA-Z0-9][a-zA-Z0-9]+$/) && ctx.url.length < 7) {
        try {
          let id = AlphabeticID.decode(ctx.url.slice(1))
          if (id) {
            let res = await ctx.db.safeCallProc('discord_embed.link_get', [id - 3843])
            if (res.first.length) {
              videoLink = ctx.state.video = res.first[0].video_link
              if (!ctx.state.video.startsWith('https://cdn.discordapp.com')
                  && !ctx.state.video.includes('catbox.')
                  && ctx.state.video.includes('?')) {
                videoLink = this.frontend + '/video/' + ctx.url.slice(1) + '.webm'
              }
              imageLink = res.first[0].image_link
            } else {
              ctx.status = 404
            }
          }
        } catch (err) {
          ctx.log.error(err, 'Unable to fetch resource ' + ctx.url.slice(1))
          ctx.state.error = 'Unknown error while fetching link.'
        }
      } else if (ctx.url !== '/') {
        ctx.status = 404
      }
    }

    if (videoLink.startsWith('https://cdn.discordapp.com')) {
      videoLink = videoLink.replace('https://cdn.discordapp.com', 'https://discordproxy.nfp.is')
    }

    let payload = {
      videoLink: videoLink,
      imageLink: imageLink,
      error: ctx.state.error || '',
      inputVideo: ctx.state.video || videoLink || '',
      inputImage: ctx.state.image || imageLink || '',
      siteUrl: this.frontend + ctx.url,
      siteUrlBase: this.frontend + '/',
      version: this.version,
      nonce: ctx.state.nonce,
      in_debug: config.get('NODE_ENV') === 'development' && false,
    }

    ctx.body = this.template(payload)
    ctx.type = 'text/html; charset=utf-8'
  }
}
