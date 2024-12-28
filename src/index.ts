import { Context, Logger, Schema } from 'koishi'

import { ChatLunaPlugin } from 'koishi-plugin-chatluna/services/chat'
import { plugins } from './plugin'
import { KnowledgeService } from './service/knowledge'
import { createLogger } from 'koishi-plugin-chatluna/utils/logger'
import { chains } from './chains'

export let logger: Logger

export function apply(ctx: Context, config: Config) {
    const plugin = new ChatLunaPlugin(ctx, config, 'knowledge-chat')
    logger = createLogger(ctx, 'chatluna-knowledge-chat')

    ctx.on('ready', async () => {
        plugin.registerToService()

        ctx.plugin(KnowledgeService, config)
    })

    const pluginEntryPoint = async (ctx: Context) => {
        await ctx.chatluna_knowledge.loader.init()

        await plugins(ctx, plugin, config)
        await chains(ctx, plugin, config)
    }

    ctx.plugin(
        {
            apply: async (ctx: Context, config: Config) => {
                ctx.on('ready', async () => {
                    await pluginEntryPoint(ctx)
                })
            },
            inject: ['chatluna', 'chatluna_knowledge', 'database'],
            name: 'chatluna_knowledge_entry_point'
        },
        config
    )
}

export const name = 'chatluna-knowledge-chat'
export * from './service/types'
export * from './service/knowledge'
export * from './llm-core/chains/type'

export interface Config extends ChatLunaPlugin.Config {
    defaultKnowledge: string
    chunkSize: number
    model: string
    chunkOverlap: number
    chunkType: string
    minSimilarityScore: number
    mode: 'default' | 'regenerate' | 'contextual-compression'
    unstructuredApiEndpoint: string
    unstructuredApiKey: string
}

export const Config = Schema.intersect([
    Schema.object({
        defaultKnowledge: Schema.dynamic('knowledge')
            .description('默认的知识库 ID')
            .default('无'),
        model: Schema.dynamic('model').description('运行知识库的模型'),
        chunkSize: Schema.number()
            .default(500)
            .max(2000)
            .min(10)
            .description('文本块的切割大小（字符）'),
        chunkOverlap: Schema.number()
            .default(0)
            .max(200)
            .min(0)
            .description(
                '文本块之间的最大重叠量（字体）。保留一些重叠可以保持文本块之间的连续性'
            ),
        chunkType: Schema.union([
            Schema.const('text').description('按文本分割'),
            Schema.const('markdown').description('按 markdown 分割'),
            Schema.const('code').description('按代码分割')
        ])
            .default('code')
            .description('文本分块方法'),
        mode: Schema.union([
            Schema.const('default').description('直接对问题查询'),
            Schema.const('regenerate').description('重新生成问题查询'),
            Schema.const('contextual-compression').description('上下文压缩查询')
        ])
            .default('default')
            .description('知识库运行模式'),
        minSimilarityScore: Schema.number()
            .role('slider')
            .min(0)
            .max(1)
            .step(0.001)
            .default(0.5)
            .description('文本搜索的最小相似度')
    }).description('基础配置'),

    Schema.object({
        unstructuredApiEndpoint: Schema.string()
            .role('url')
            .default('http://127.0.0.1:8000')
            .description('unstructured 接口地址'),

        unstructuredApiKey: Schema.string()
            .role('secret')
            .description('unstructured 接口密钥')
    }).description('unstructured 配置')
])

export const inject = ['chatluna']

export const usage = `
现我们不再直接依赖相关库，你需要自己安装相关依赖到 koishi 根目录下。

## **重要提示**

安装这些额外依赖，如果失败，可能会导致 koishi 无法启动，无法安装任何依赖等问题。请谨慎操作。

要查看如何配置 pdf 文件, 看[这里](https://js.langchain.com/docs/how_to/document_loader_pdf/)

要查看如何配置 csv，看[这里](https://js.langchain.com/docs/how_to/document_loader_csv/)

要查看如何配置 docx，看[这里](https://js.langchain.com/docs/integrations/document_loaders/file_loaders/docx/)

要查看如何配置 unstructured，看[这里](https://js.langchain.com/docs/how_to/document_loader_html)

使用之前用 \`chatluna knowledge upload\` 上传文件到知识库。然后在上面选择那个知识库。

先选择一次无，在选择这个知识库！！！

模型也要选择，随便选一个便宜的模型就行了。
`
