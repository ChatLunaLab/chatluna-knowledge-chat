import { ChatChain } from '@dingyi222666/koishi-plugin-chathub/lib/chains/chain'
import { Context } from 'koishi'
import { Config, knowledgeService } from '..'
import { ChatHubPlugin } from '@dingyi222666/koishi-plugin-chathub/lib/services/chat'
import type {} from '@dingyi222666/koishi-plugin-chathub/lib/llm-core/memory/message/database_memory'
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

            await knowledgeService.uploadDocument(documents, path)

            return `已成功上传到 ${ctx.chathub.config.defaultVectorStore} 向量数据库`
        })

    ctx.command('chathub.knowledge.delete [path:string]', '删除资料')
        .option('db', '-d --db <string> 数据库名')
        .action(async ({ session }, path) => {})
}

export async function setRoomKnowledgeConfig(
    ctx: Context,
    conversationId: string,
    configId: string
) {
    const queryConversation = (
        await ctx.database.get('chathub_conversation', {
            id: conversationId
        })
    )?.[0]

    if (queryConversation == null) {
        throw new ChatHubError(ChatHubErrorCode.ROOM_NOT_FOUND)
    }

    const rawAdditionalKwargs = queryConversation.additional_kwargs ?? '{}'

    const additionalKwargs = JSON.parse(rawAdditionalKwargs)

    additionalKwargs.knowledgeId = configId

    await ctx.database.upsert('chathub_conversation', [queryConversation])
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

    const fileStat = await fs.stat(filePath)

    if (!copy) {
        await fs.symlink(filePath, copyPath, fileStat.isFile() ? 'file' : 'dir')
    } else {
        await fs.copyFile(filePath, copyPath)
    }

    return copyPath
}
