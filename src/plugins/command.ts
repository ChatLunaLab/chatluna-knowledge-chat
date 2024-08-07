import { ChatChain } from 'koishi-plugin-chatluna/chains'
import { Context } from 'koishi'
import { Config } from '..'
import { ChatLunaPlugin } from 'koishi-plugin-chatluna/services/chat'
import path from 'path'
import fs from 'fs/promises'
import {
    ChatLunaError,
    ChatLunaErrorCode
} from 'koishi-plugin-chatluna/utils/error'
import type {} from 'koishi-plugin-chatluna/llm-core/memory/message'
import { Pagination } from 'koishi-plugin-chatluna/utils/pagination'

import { DocumentConfig } from '../types'

export async function apply(
    ctx: Context,
    config: Config,
    plugin: ChatLunaPlugin,
    chain: ChatChain
): Promise<void> {
    ctx.command('chatluna.knowledge', 'QA问题相关命令')

    ctx.command('chatluna.knowledge.upload <path:string>', '上传资料')
        .option('size', '-s --size <value:number> 文本块的切割大小（字符）')
        .option('overlap', '-o --overlap <value:number> 文件路径')
        .option('copy', '-c --copy <value:boolean> 是否把数据复制到缓存路径', {
            fallback: false
        })
        .action(async ({ options, session }, path) => {
            if (path.startsWith('http')) {
                return `目前暂不支持 url：${path}`
            }

            path = await copyDocument(ctx, path, options.copy)

            const loader = ctx.chatluna_knowledge.loader

            const supported = await loader.support(path)

            if (!supported) {
                return `不支持的文件类型：${path}`
            }

            const documents = await loader.load(path, {
                chunkOverlap: options.overlap ?? config.chunkOverlap,
                chunkSize: options.size ?? config.chunkSize
            })

            await session.send(
                `已对 ${path} 解析成 ${documents.length} 个文档块。正在保存至数据库`
            )

            await ctx.chatluna_knowledge.uploadDocument(documents, path)

            return `已成功上传到 ${ctx.chatluna.config.defaultVectorStore} 向量数据库`
        })

    ctx.command('chatluna.knowledge.delete [path:string]', '删除资料')
        .option('db', '-d --db <string> 数据库名')
        .action(async ({ options, session }, path) => {
            await session.send(
                `正在从数据库中删除 ${path}，是否确认删除？回复大写 Y 以确认删除`
            )

            const promptResult = await session.prompt(1000 * 30)

            if (promptResult == null || promptResult !== 'Y') {
                return '已取消删除'
            }

            await deleteDocument(ctx, path, options.db)

            return `已成功删除文档 ${path}`
        })

    ctx.command(
        'chatluna.knowledge.set [name:string]',
        '切换当前环境使用的文档配置'
    )
        .option('room', '-r --room <string> 房间名')
        .action(async ({ options, session }, name) => {
            await chain.receiveCommand(session, 'set_knowledge_config', {
                knowledge_config: name,
                room_resolve: {
                    id: options.room,
                    name: options.room
                }
            })
        })

    ctx.command('chatluna.knowledge.list', '列出资料')
        .option('page', '-p <page:number> 页码', { fallback: 1 })
        .option('limit', '-l <limit:number> 每页数量', { fallback: 10 })
        .option('db', '-d --db <string> 数据库名')
        .action(async ({ options, session }) => {
            const pagination = new Pagination<DocumentConfig>({
                formatItem: (value) => formatDocumentInfo(value),
                formatString: {
                    top: '以下是你目前所有已经上传的文档\n',
                    bottom: '你可以使用 chatluna.knowledge.set <name> 来切换当前环境里你使用的文档配置（文档配置不是文档）'
                }
            })

            const documents = await ctx.chatluna_knowledge.listDocument(
                options.db
            )

            await pagination.push(documents)

            return pagination.getFormattedPage(options.page, options.limit)
        })
}

function formatDocumentInfo(document: DocumentConfig) {
    return document.path
}

export async function setRoomKnowledgeConfig(
    ctx: Context,
    conversationId: string,
    configId: string
) {
    if (
        (await ctx.chatluna_knowledge_config.getConfig(
            configId,
            true,
            false
        )) == null
    ) {
        throw new ChatLunaError(
            ChatLunaErrorCode.KNOWLEDGE_CONFIG_INVALID,
            new Error(`The config id ${configId} is invalid`)
        )
    }

    const queryConversation = (
        await ctx.database.get('chathub_conversation', {
            id: conversationId
        })
    )?.[0]

    if (queryConversation == null) {
        throw new ChatLunaError(ChatLunaErrorCode.ROOM_NOT_FOUND)
    }

    const rawAdditionalKwargs = queryConversation.additional_kwargs ?? '{}'

    const additionalKwargs = JSON.parse(rawAdditionalKwargs)

    additionalKwargs.knowledgeId = configId

    await ctx.database.upsert('chathub_conversation', [queryConversation])
}

async function deleteDocument(ctx: Context, filePath: string, db: string) {
    if (!filePath.startsWith('http')) {
        try {
            await fs.access(filePath)
        } catch (e) {
            filePath = path.resolve(
                ctx.baseDir,
                'data/chathub/knowledge/data',
                filePath
            )
        }

        if (filePath.startsWith(ctx.baseDir)) {
            await fs.rm(filePath, { recursive: true })
        }
    }

    await ctx.chatluna_knowledge.deleteDocument(filePath, db)
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
            throw new ChatLunaError(
                ChatLunaErrorCode.KNOWLEDGE_EXIST_FILE,
                new Error(`The path already exists: ${copyPath}`)
            )
        }
    } catch (e) {
        if (e instanceof ChatLunaError) {
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
