import { ChatChain } from '@dingyi222666/koishi-plugin-chathub/lib/chains/chain'
import { Context } from 'koishi'
import { Config, knowledgeService } from '..'
import { ChatHubPlugin } from '@dingyi222666/koishi-plugin-chathub/lib/services/chat'
import path from 'path'
import fs from 'fs/promises'
import { ChatHubError, ChatHubErrorCode } from '@dingyi222666/koishi-plugin-chathub/lib/utils/error'

export async function apply(
    ctx: Context,
    config: Config,
    plugin: ChatHubPlugin,
    chain: ChatChain
): Promise<void> {
    ctx.command('chathub.knowledge', 'QA问题相关命令')

    ctx.command('chathub.knowledge.upload <path:string>', '上传资料')
        .option('size', '-s --size <value:number> 文本块的切割大小（字符）')
        .option('overlap', '-o --overlap <value:number> 文件路径')
        .option('copy', '-c --copy <value:boolean> 是否把数据复制到缓存路径', { fallback: false })
        .action(async ({ options, session }, path) => {
            path = await copyDocument(ctx, path, options.copy)
            const loader = knowledgeService.loader

            const supported = await loader.support(path)

            if (!supported) {
                return `不支持的文件类型：${path}`
            }

            const documents = await loader.load(path, {
                chunkOverlap: options.overlap ?? config.chunkOverlap,
                chunkSize: options.size ?? config.chunkSize
            })

            await session.send(`已对 ${path} 解析成 ${documents.length} 个文档块。正在保存至数据库`)

            console.log(JSON.stringify(documents))

            await knowledgeService.uploadDocument(documents, path)

            return `已成功上传到 ${ctx.chathub.config.defaultVectorStore} 向量数据库`
        })

    ctx.command('chathub.knowledge.delete [path:string]', '删除资料')
        .option('db', '-d --db <string> 数据库名')
        .action(async ({ session }, path) => {})
}

async function copyDocument(ctx: Context, filePath: string, copy: boolean) {
    const fileName = path.basename(filePath)

    const copyToDir = path.resolve(ctx.baseDir, 'data/chathub/knowledge/data')

    try {
        await fs.access(copyToDir)
    } catch (e) {
        await fs.mkdir(copyToDir, { recursive: true })
    }

    const copyPath = path.resolve(copyToDir, fileName)

    try {
        if ((await fs.stat(copyPath)).isFile()) {
            throw new ChatHubError(
                ChatHubErrorCode.KNOWLEDGE_EXIST_FILE,
                new Error(`The path already exists: ${copyPath}`)
            )
        }
    } catch (e) {
        if (e instanceof ChatHubError) {
            throw e
        }
    }

    if (!copy) {
        await fs.symlink(filePath, copyPath, 'file')
    } else {
        await fs.copyFile(filePath, copyPath)
    }

    return copyPath
}
