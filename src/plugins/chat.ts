import { Context } from 'koishi'
import { Config, logger } from '..'
import { ChatLunaPlugin } from 'koishi-plugin-chatluna/services/chat'
import { getMessageContent } from 'koishi-plugin-chatluna/utils/string'

export async function apply(
    ctx: Context,
    config: Config,
    plugin: ChatLunaPlugin
): Promise<void> {
    if (!config.enableChatIntegration) {
        return
    }

    const cache: Map<string, string> = new Map()

    ctx.before(
        'chatluna/chat',
        async (conversationId, message, promptVariables, chatInterface) => {
            try {
                // Get or create default knowledge base for this conversation
                let knowledgeBaseId = cache.get(conversationId)

                if (!knowledgeBaseId) {
                    knowledgeBaseId = await getDefaultKnowledgeBase(ctx, config)

                    if (!knowledgeBaseId) {
                        logger.warn('No default knowledge base available')
                        return
                    }

                    cache.set(conversationId, knowledgeBaseId)
                }

                const options = {
                    k: config.topK || 5,
                    threshold: config.minSimilarityScore ?? 0.75
                }

                // Perform similarity search
                const documents = await ctx.chatluna_knowledge.similaritySearch(
                    knowledgeBaseId,
                    getMessageContent(message.content),
                    options
                )

                logger.debug(
                    `Found ${documents.length} relevant documents for query: "${message.content}"`
                )

                if (documents.length > 0) {
                    logger.debug(
                        `Documents: ${documents
                            .map((doc) => doc.pageContent.substring(0, 100))
                            .join('\n\n')
                            .substring(0, 100)}`
                    )
                }

                promptVariables['knowledge'] = documents
            } catch (error) {
                logger.error('Error during knowledge retrieval:', error)
                // Continue without knowledge if retrieval fails
                promptVariables['knowledge'] = []
            }
        }
    )

    ctx.on('chatluna/clear-chat-history', async () => {
        cache.clear()
        ctx.chatluna_knowledge.clearCache()
    })
}

/**
 * Get or create a default knowledge base
 */
async function getDefaultKnowledgeBase(
    ctx: Context,
    config: Config
): Promise<string | null> {
    try {
        // First try to find existing default knowledge base
        const knowledgeBases = await ctx.chatluna_knowledge.listKnowledgeBases()

        // Look for a knowledge base with the default name
        let defaultKB = knowledgeBases.find(
            (kb) => kb.name === config.defaultKnowledge || kb.name === 'default'
        )

        if (!defaultKB && knowledgeBases.length > 0) {
            // Use the first available knowledge base if no default found
            defaultKB = knowledgeBases[0]
            logger.info(
                `Using knowledge base: ${defaultKB.name} (${defaultKB.id})`
            )
        }

        if (!defaultKB) {
            return null
        }

        return defaultKB.id
    } catch (error) {
        logger.error('Error getting default knowledge base:', error)
        return null
    }
}
