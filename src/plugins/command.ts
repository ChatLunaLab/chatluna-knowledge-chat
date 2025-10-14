import { Context } from 'koishi'
import { Config, logger } from '..'
import { ChatLunaPlugin } from 'koishi-plugin-chatluna/services/chat'
import { Pagination } from 'koishi-plugin-chatluna/utils/pagination'
import { DocumentConfig } from '../service/knowledge'
import { Document } from '@langchain/core/documents'
import { RAGRetrieverType } from 'koishi-plugin-chatluna-vector-store-service'
import { processAndUploadDocuments } from '../utils'

export async function apply(
    ctx: Context,
    config: Config,
    plugin: ChatLunaPlugin
): Promise<void> {
    ctx.command('chatluna.knowledge', 'ChatLuna 知识库相关命令')

    // Create knowledge base command with optional document upload
    ctx.command('chatluna.knowledge.create <name:string>', '创建知识库')
        .option(
            'type',
            '-t --type <type:string> RAG类型 (standard/hippo_rag/light_rag)',
            { fallback: config.defaultRagType }
        )
        .option('description', '-d <desc:string> 知识库描述')
        .option('embeddings', '-e <embeddings:string> 嵌入模型')
        .option('upload', '-u <upload:string> 创建后立即上传文档')
        .option('size', '-s <size:number> 文本块的切割大小（字符）')
        .option('overlap', '-o <overlap:number> 切块重叠大小')
        .option('chunkType', '-c <chunk-type:string> 分割使用的方法')
        .action(async ({ options, session }, name) => {
            console.log(options)
            try {
                // Validate RAG type
                const validTypes: RAGRetrieverType[] = [
                    'standard',
                    'hippo_rag',
                    'light_rag'
                ]
                if (!validTypes.includes(options.type as RAGRetrieverType)) {
                    return `不支持的RAG类型：${options.type}。支持的类型有：${validTypes.join(', ')}`
                }

                // Create knowledge base
                const knowledgeBaseId =
                    await ctx.chatluna_knowledge.createKnowledgeBase(
                        name,
                        options.type as RAGRetrieverType,
                        {
                            description: options.description,
                            embeddings: options.embeddings
                        }
                    )

                await session.send(
                    `已创建知识库 "${name}" (ID: ${knowledgeBaseId})`
                )

                // Upload documents using unified function
                const uploadResult = await processAndUploadDocuments(
                    ctx,
                    session,
                    knowledgeBaseId,
                    {
                        size: options.size,
                        overlap: options.overlap,
                        chunkType: options.chunkType,
                        initialPath: options.upload
                    }
                )

                return uploadResult
            } catch (error) {
                logger.error(error)
                return `创建知识库失败：${error.message}`
            }
        })

    // Upload documents to knowledge base
    ctx.command(
        'chatluna.knowledge.upload <knowledgeBase:string>',
        '上传文档到知识库'
    )
        .option('size', '-s <size:number> 文本块的切割大小（字符）')
        .option('overlap', '-o <overlap:number> 切块重叠大小')
        .option('chunkType', '-c <chunk-type:string> 分割使用的方法')
        .option('upload', '-u <upload:string> 文档上传路径')
        .action(async ({ options, session }, knowledgeBase) => {
            try {
                const config =
                    await ctx.chatluna_knowledge.getDocumentConfig(
                        knowledgeBase
                    )

                if (!config) {
                    return `知识库 "${knowledgeBase}" 不存在！`
                }

                return await processAndUploadDocuments(
                    ctx,
                    session,
                    config.id,
                    {
                        size: options.size,
                        overlap: options.overlap,
                        chunkType: options.chunkType,
                        initialPath: options.upload
                    }
                )
            } catch (error) {
                logger.error(error)
                return `上传失败：${error.message}`
            }
        })

    // Delete knowledge base or documents
    ctx.command('chatluna.knowledge.delete <target:string>', '删除知识库或文档')
        .option('kb', '-k 删除整个知识库')
        .option('docs', '-d <docs:string> 删除指定文档ID（逗号分隔）')
        .action(async ({ options, session }, target) => {
            try {
                if (options.kb) {
                    // Delete entire knowledge base
                    await session.send(
                        `警告: 即将删除知识库 "${target}" 及其所有文档，此操作不可恢复！\n回复大写 Y 以确认删除`
                    )

                    const promptResult = await session.prompt(1000 * 30)

                    if (promptResult == null || promptResult !== 'Y') {
                        return '已取消删除'
                    }

                    await ctx.chatluna_knowledge.deleteKnowledgeBase(target)
                    return `已成功删除知识库 "${target}"`
                } else {
                    // Delete specific documents from knowledge base
                    let documentIds: string[] | undefined

                    if (options.docs) {
                        documentIds = options.docs
                            .split(',')
                            .map((id) => id.trim())
                        await session.send(
                            `警告: 即将从知识库删除文档 ${documentIds.join(', ')}\n回复大写 Y 以确认删除`
                        )
                    } else {
                        await session.send(
                            `警告: 即将删除知识库 "${target}" 中的所有文档\n回复大写 Y 以确认删除`
                        )
                    }

                    const promptResult = await session.prompt(1000 * 30)

                    if (promptResult == null || promptResult !== 'Y') {
                        return '已取消删除'
                    }

                    await ctx.chatluna_knowledge.deleteDocument(
                        target,
                        documentIds
                    )

                    if (documentIds) {
                        return `已成功删除文档 ${documentIds.join(', ')}`
                    } else {
                        return `已成功删除知识库 "${target}" 中的所有文档`
                    }
                }
            } catch (error) {
                logger.error(error)
                return `删除失败：${error.message}`
            }
        })

    // List knowledge bases or documents
    ctx.command(
        'chatluna.knowledge.list [knowledgeBase:string]',
        '列出知识库或文档'
    )
        .option('page', '-p <page:number> 页码', { fallback: 1 })
        .option('limit', '-l <limit:number> 每页数量', { fallback: 10 })
        .option('docs', '-d 列出知识库中的文档')
        .action(async ({ options, session }, knowledgeBase) => {
            try {
                if (!knowledgeBase) {
                    // List all knowledge bases
                    const pagination = new Pagination<DocumentConfig>({
                        formatItem: (kb) => formatKnowledgeBaseInfo(kb),
                        formatString: {
                            pages: '第 [page] / [total] 页',
                            top: '所有知识库列表\n',
                            bottom: '\n提示: 使用 chatluna.knowledge.list <知识库名> --docs 查看知识库中的文档'
                        }
                    })

                    const knowledgeBases =
                        await ctx.chatluna_knowledge.listKnowledgeBases()
                    await pagination.push(knowledgeBases)

                    return pagination.getFormattedPage(
                        options.page,
                        options.limit
                    )
                } else {
                    // List documents in specific knowledge base
                    if (options.docs) {
                        const pagination = new Pagination<Document>({
                            formatItem: (doc) => formatDocumentInfo(doc),
                            formatString: {
                                pages: '第 [page] / [total] 页',
                                top: `知识库 "${knowledgeBase}" 中的文档\n`,
                                bottom: '\n提示: 使用 chatluna.knowledge.delete <知识库名> --docs <文档ID> 删除特定文档'
                            }
                        })

                        const documents =
                            await ctx.chatluna_knowledge.listDocuments(
                                knowledgeBase
                            )
                        await pagination.push(documents)

                        return pagination.getFormattedPage(
                            options.page,
                            options.limit
                        )
                    } else {
                        // Show knowledge base stats
                        const stats =
                            await ctx.chatluna_knowledge.getKnowledgeBaseStats(
                                knowledgeBase
                            )
                        const knowledgeBases =
                            await ctx.chatluna_knowledge.listKnowledgeBases()
                        const config = knowledgeBases.find(
                            (kb) =>
                                kb.id === knowledgeBase ||
                                kb.name === knowledgeBase
                        )

                        if (!config) {
                            return `错误: 知识库 "${knowledgeBase}" 不存在`
                        }

                        return `知识库信息：
名称：${config.name}
ID：${config.id}
类型：${config.ragType}
描述：${config.description || '无'}
文档总数：${stats.totalDocuments}
向量存储类型：${stats.vectorStoreType}
最后更新：${stats.lastUpdated || '未知'}

提示: 使用 --docs 参数查看文档列表`
                    }
                }
            } catch (error) {
                logger.error(error)
                return `查询失败：${error.message}`
            }
        })
}

function formatKnowledgeBaseInfo(kb: DocumentConfig): string {
    return `${kb.name} (${kb.ragType})
   ID: ${kb.id}
   描述: ${kb.description || '无'}
   创建时间: ${kb.createdAt?.toLocaleString() || '未知'}`
}

function formatDocumentInfo(doc: Document): string {
    const metadata = doc.metadata || {}
    const preview =
        doc.pageContent.substring(0, 100) +
        (doc.pageContent.length > 100 ? '...' : '')

    return `ID: ${metadata.id || '未知'}
   来源: ${metadata.source || '未知'}
   预览: ${preview}`
}
