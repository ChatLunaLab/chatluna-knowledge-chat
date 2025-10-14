/* eslint-disable max-len */
import { Context } from 'koishi'
import { Config, logger } from '..'
import { ChatLunaPlugin } from 'koishi-plugin-chatluna/services/chat'
import { getMessageContent } from 'koishi-plugin-chatluna/utils/string'

export async function apply(
    ctx: Context,
    config: Config,
    plugin: ChatLunaPlugin
): Promise<void> {
    ctx.chatluna.promptRenderer.registerFunctionProvider(
        'knowledge',
        async (args, variables, configurable) => {
            logger.debug(`Knowledge function called with args: ${args}`)

            // Parse knowledge base names from arguments
            // Support both knowledge("kb1") and knowledge("kb1", "kb2") syntax
            const knowledgeBaseNames =
                args.length > 0 ? args : [config.defaultKnowledge]

            // Filter out invalid knowledge base names
            const validKnowledgeBases = knowledgeBaseNames.filter(
                (name) => name && name !== '无'
            )

            if (validKnowledgeBases.length === 0) {
                logger.warn(
                    'No valid knowledge bases specified and no default configured'
                )
                return ''
            }

            // Get the search query from the prompt content
            let searchContent: string = variables['prompt'] as string

            if (Array.isArray(variables['prompt'])) {
                searchContent = getMessageContent(variables['prompt'])
            }

            if (!searchContent || searchContent.trim().length === 0) {
                logger.debug(
                    'No search content provided, skipping knowledge search'
                )
                return ''
            }

            logger.debug(
                `Searching in knowledge bases: ${validKnowledgeBases.join(', ')} with query: "${searchContent}"`
            )

            // Search each knowledge base
            const allDocuments = await Promise.all(
                validKnowledgeBases.map(async (kbName) => {
                    try {
                        const kbConfig =
                            await ctx.chatluna_knowledge.getDocumentConfig(
                                kbName
                            )

                        if (!kbConfig) {
                            logger.warn(
                                `Knowledge base "${kbName}" not found, skipping`
                            )
                            return []
                        }

                        // Use config defaults for topK and threshold
                        const searchOptions = {
                            k: config.topK ?? 5,
                            threshold: config.minSimilarityScore ?? 0.75
                        }

                        const documents =
                            await ctx.chatluna_knowledge.similaritySearch(
                                kbConfig.id,
                                searchContent,
                                searchOptions
                            )

                        logger.debug(
                            `Found ${documents.length} documents in knowledge base "${kbName}"`
                        )

                        return documents.map((doc) => ({
                            content: doc.pageContent,
                            metadata: doc.metadata,
                            knowledgeBase: kbName
                        }))
                    } catch (error) {
                        logger.error(
                            `Error searching knowledge base "${kbName}":`,
                            error
                        )
                        return []
                    }
                })
            )

            // Flatten and combine results
            const documents = allDocuments.flat()

            if (documents.length === 0) {
                logger.debug('No relevant documents found in knowledge bases')
                return ''
            }

            logger.debug(
                `Total ${documents.length} documents retrieved from knowledge bases`
            )

            // Format the results
            const sections: string[] = []

            // Group documents by knowledge base
            const documentsByKB = new Map<string, typeof documents>()

            documents.forEach((doc) => {
                const kbName = doc.knowledgeBase
                if (!documentsByKB.has(kbName)) {
                    documentsByKB.set(kbName, [])
                }
                documentsByKB.get(kbName)!.push(doc)
            })

            // Format each knowledge base section
            for (const [kbName, docs] of documentsByKB.entries()) {
                const docItems = docs.map((doc, index) => {
                    const parts: string[] = []
                    parts.push(`  Content: ${doc.content}`)

                    if (doc.metadata && Object.keys(doc.metadata).length > 0) {
                        parts.push(`  Source: ${JSON.stringify(doc.metadata)}`)
                    }

                    return parts.join('\n')
                })

                sections.push(
                    `## Knowledge Base: ${kbName}\n\n${docItems.join('\n\n')}`
                )
            }

            // Create header
            const header = `# Knowledge Base Context\n\nThe following information has been retrieved from the knowledge bases based on your query. This context provides relevant information to help answer your question.\n`

            return header + '\n' + sections.join('\n\n')
        }
    )
}
