import { Context, Logger, Schema } from 'koishi'

import { ChatLunaPlugin } from 'koishi-plugin-chatluna/lib/services/chat'
import { plugins } from './plugin'
import { KnowledgeConfigService, KnowledgeService } from './service/knowledge'
import { createLogger } from 'koishi-plugin-chatluna/lib/utils/logger'

export let knowledgeConfigService: KnowledgeConfigService
export let knowledgeService: KnowledgeService
export let logger: Logger

export function apply(ctx: Context, config: Config) {
    const plugin = new ChatLunaPlugin(ctx, config, 'knowledge-chat')
    logger = createLogger(ctx, 'chatluna-knowledge-chat')

    ctx.on('ready', async () => {
        knowledgeConfigService = new KnowledgeConfigService(ctx)
        knowledgeService = new KnowledgeService(
            ctx,
            config,
            knowledgeConfigService
        )

        await plugin.registerToService()

        await knowledgeConfigService.loadAllConfig()
        await knowledgeService.loader.init()

        await plugins(ctx, plugin, config)
    })

    ctx.on('dispose', async () => {
        knowledgeConfigService = null
    })
}

export const name = '@dingyi222666/chathub-knowledge-chat'

export interface Config extends ChatLunaPlugin.Config {
    defaultConfig: string
    chunkSize: number
    chunkOverlap: number
    minSimilarityScore: number
    mode: 'default' | 'regenerate' | 'contextual-compression'
    unstructuredApiEndpoint: string
    unstructuredApiKey: string
}

export const Config = Schema.intersect([
    Schema.object({
        defaultConfig: Schema.dynamic('knowledge-config')
            .default('default')
            .description('默认的知识库配置文件'),
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

要查看如何配置 pdf 文件, 看[这里](https://js.langchain.com/docs/modules/data_connection/document_loaders/how_to/pdf)

要查看如何配置 csv，看[这里](https://js.langchain.com/docs/modules/data_connection/document_loaders/integrations/file_loaders/csv)

要查看如何配置 docx，看[这里](https://js.langchain.com/docs/modules/data_connection/document_loaders/integrations/file_loaders/docx)

要查看如何配置 web 网页，看[这里](https://js.langchain.com/docs/modules/data_connection/document_loaders/integrations/web_loaders/web_cheerio)
`
