import { ChatChain } from 'koishi-plugin-chatluna/chains'
import { Context } from 'koishi'
import { Config } from '..'
import { ChatLunaPlugin } from 'koishi-plugin-chatluna/services/chat'
import type {} from 'koishi-plugin-chatluna/llm-core/memory/message'
import { Pagination } from 'koishi-plugin-chatluna/utils/pagination'
import fs from 'fs/promises'
import { DocumentConfig } from '../types'
import path from 'path'

export async function apply(
    ctx: Context,
    config: Config,
    plugin: ChatLunaPlugin,
    chain: ChatChain
): Promise<void> {
    ctx.command('chatluna.knowledge', 'ChatLuna 知识库相关命令')

    ctx.command('chatluna.knowledge.upload <path:string>', '上传资料')
        .option('size', '-s --size <value:number> 文本块的切割大小（字符）')
        .option('overlap', '-o --overlap <value:number> 文件路径')
        .action(async ({ options, session }, path) => {
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

    ctx.command('chatluna.knowledge.init', '从默认文件夹初始化知识库')
        .option('size', '-s --size <value:number> 文本块的切割大小（字符）')
        .option('overlap', '-o --overlap <value:number> 文件路径')
        .action(async ({ options, session }) => {
            const loader = ctx.chatluna_knowledge.loader

            const load = async (path: string) => {
                const supported = await loader.support(path)

                if (!supported) {
                    ctx.logger.warn(`不支持的文件类型：${path}`)
                    return false
                }

                const documents = await loader.load(path, {
                    chunkOverlap: options.overlap ?? config.chunkOverlap,
                    chunkSize: options.size ?? config.chunkSize
                })

                ctx.logger.info(
                    `已对 ${path} 解析成 ${documents.length} 个文档块。正在保存至数据库`
                )

                await ctx.chatluna_knowledge.uploadDocument(documents, path)

                ctx.logger.info(
                    `已成功上传到 ${ctx.chatluna.config.defaultVectorStore} 向量数据库`
                )

                return true
            }

            const knowledgeDir = path.join(
                ctx.baseDir,
                'data/chathub/knowledge/default'
            )

            const files = await fs.readdir(knowledgeDir)

            const successPaths: string[] = []
            for (const file of files) {
                const filePath = path.join(knowledgeDir, file)

                const result = await load(filePath)

                if (result) {
                    successPaths.push(filePath)
                }
            }

            return `已成功上传 ${successPaths.length} / ${files.length} 个文档到 ${ctx.chatluna.config.defaultVectorStore} 向量数据库`
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

    ctx.command('chatluna.knowledge.list', '列出资料')
        .option('page', '-p <page:number> 页码', { fallback: 1 })
        .option('limit', '-l <limit:number> 每页数量', { fallback: 10 })
        .option('db', '-d --db <string> 数据库名')
        .action(async ({ options, session }) => {
            const pagination = new Pagination<DocumentConfig>({
                formatItem: (value) => formatDocumentInfo(value),
                formatString: {
                    pages: '第 [page] / [total] 页',
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

async function deleteDocument(ctx: Context, filePath: string, db: string) {
    await ctx.chatluna_knowledge.deleteDocument(filePath, db)
}
