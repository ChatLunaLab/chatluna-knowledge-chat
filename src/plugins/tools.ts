/* eslint-disable max-len */
import { Context } from 'koishi'
import { Config, logger } from '..'
import { ChatLunaPlugin } from 'koishi-plugin-chatluna/services/chat'
import { StructuredTool } from '@langchain/core/tools'
import { z } from 'zod'

export async function apply(
    ctx: Context,
    config: Config,
    plugin: ChatLunaPlugin
): Promise<void> {
    plugin.registerTool('knowledge_search', {
        selector() {
            return true
        },
        createTool() {
            return new KnowledgeSearchTool(ctx, config)
        }
    })
}

/**
 * Knowledge base search tool that allows querying one or more knowledge bases
 */
export class KnowledgeSearchTool extends StructuredTool {
    name = 'knowledge_search'

    description = `Search for information in the knowledge base. This tool queries configured knowledge bases to retrieve relevant information based on your query.

Use this tool when you need to:
- Find specific information from the knowledge base
- Get context about topics covered in the knowledge base
- Retrieve relevant documents or passages

Input should be a JSON object with:
- query (required): The search query string
- knowledge (optional): Array of knowledge base names to search. If not provided, uses the default knowledge base from config.
- topK (optional): Number of results to return (default: from config)
- threshold (optional): Minimum similarity score threshold (default: from config)

Example inputs:
{"query": "What is the capital of France?"}
{"query": "Explain machine learning", "knowledge": ["ml-docs", "ai-basics"], "topK": 10}
{"query": "Python syntax", "knowledge": ["python-docs"], "threshold": 0.8}`

    schema = z.object({
        query: z.string().describe('The search query'),
        knowledge: z
            .array(z.string())
            .optional()
            .describe(
                'Optional array of knowledge base names to search. If not provided, uses default knowledge base.'
            ),
        topK: z
            .number()
            .optional()
            .describe(
                'Number of results to return (default: from config or 5)'
            ),
        threshold: z
            .number()
            .optional()
            .describe(
                'Minimum similarity score threshold 0-1 (default: from config or 0.75)'
            )
    })

    constructor(
        private ctx: Context,
        private config: Config
    ) {
        super()
    }

    async _call(input: z.infer<typeof this.schema>) {
        try {
            // Parse input if it's a string
            const parsedInput = input

            const { query, knowledge, topK, threshold } = parsedInput

            if (!query || query.trim().length === 0) {
                return 'Error: Query cannot be empty'
            }

            // Determine which knowledge base(s) to search
            let knowledgeBaseIds: string[]

            if (knowledge && knowledge.length > 0) {
                // Use specified knowledge bases
                knowledgeBaseIds = []
                for (const kbName of knowledge) {
                    const kbConfig =
                        await this.ctx.chatluna_knowledge.getDocumentConfig(
                            kbName
                        )
                    if (kbConfig) {
                        knowledgeBaseIds.push(kbConfig.id)
                    } else {
                        logger.warn(
                            `Knowledge base "${kbName}" not found, skipping`
                        )
                    }
                }

                if (knowledgeBaseIds.length === 0) {
                    return `Error: None of the specified knowledge bases were found: ${knowledge.join(', ')}`
                }
            } else {
                // Use default knowledge base from config
                const defaultKB = this.config.defaultKnowledge

                if (!defaultKB || defaultKB === '无') {
                    return 'Error: No default knowledge base configured. Please specify knowledge bases to search.'
                }

                const kbConfig =
                    await this.ctx.chatluna_knowledge.getDocumentConfig(
                        defaultKB
                    )

                if (!kbConfig) {
                    return `Error: Default knowledge base "${defaultKB}" not found`
                }

                knowledgeBaseIds = [kbConfig.id]
            }

            logger.debug(
                `Searching in knowledge bases: ${knowledgeBaseIds.join(', ')}`
            )

            // Search options
            const searchOptions = {
                k: topK ?? this.config.topK ?? 5,
                threshold: threshold ?? this.config.minSimilarityScore ?? 0.75
            }

            // Perform search in all specified knowledge bases
            const allResults = await Promise.all(
                knowledgeBaseIds.map((kbId) =>
                    this.ctx.chatluna_knowledge.similaritySearch(
                        kbId,
                        query,
                        searchOptions
                    )
                )
            )

            // Flatten and combine results
            const documents = allResults.flat()

            if (documents.length === 0) {
                return `No relevant information found for query: "${query}"`
            }

            logger.debug(
                `Found ${documents.length} relevant documents for query: "${query}"`
            )

            // Format results
            const results = documents
                .map((doc, index) => {
                    const metadata = doc.metadata
                        ? `\n[Source: ${JSON.stringify(doc.metadata)}]`
                        : ''
                    return `Result ${index + 1}:\n${doc.pageContent}${metadata}`
                })
                .join('\n\n---\n\n')

            return results
        } catch (error) {
            logger.error('Error during knowledge search:', error)
            return `Knowledge search failed: ${error.message}`
        }
    }
}
