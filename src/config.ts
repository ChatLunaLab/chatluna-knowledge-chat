import { Schema } from 'koishi'
import { ChatLunaPlugin } from 'koishi-plugin-chatluna/services/chat'

export interface Config extends ChatLunaPlugin.Config {
    enableChatIntegration: boolean
    defaultKnowledge: string
    defaultRagType: 'standard' | 'hippo_rag' | 'light_rag'
    chunkSize: number
    standardModel: string
    topK: number
    chunkOverlap: number
    chunkType: string
    minSimilarityScore: number
    standardMode: 'default' | 'regenerate' | 'contextual-compression'
    unstructuredApiEndpoint: string
    unstructuredApiKey: string
    // HippoRAG configuration
    hippoModel: string
    hippoRetrievalTopK: number
    hippoLinkingTopK: number
    hippoPassageNodeWeight: number
    hippoDamping: number
    hippoSynonymyEdgeTopK: number
    hippoSynonymyEdgeSimThreshold: number
    // LightRAG configuration
    lightragBaseUrl: string
    lightragApiKey: string
    lightragQueryMode:
        | 'local'
        | 'global'
        | 'hybrid'
        | 'naive'
        | 'mix'
        | 'bypass'
}

export const Config = Schema.intersect([
    Schema.object({
        enableChatIntegration: Schema.boolean()
            .default(true)
            .description('是否将知识库注入到主插件的房间聊天中'),
        defaultKnowledge: Schema.dynamic('knowledge')
            .description('默认的知识库 ID')
            .default('无'),
        defaultRagType: Schema.union([
            Schema.const('standard').description('标准 RAG'),
            Schema.const('hippo_rag').description('HippoRAG'),
            Schema.const('light_rag').description('LightRAG')
        ])
            .default('standard')
            .description(
                '默认使用的 RAG 引擎类型。注意此项只**针对新创建的知识库**，具体的知识库类型请使用列出知识库指令。'
            ),

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

        minSimilarityScore: Schema.number()
            .role('slider')
            .min(0)
            .max(1)
            .step(0.001)
            .default(0.5)
            .description('文本搜索的最小相似度'),
        topK: Schema.number()
            .role('slider')
            .min(1)
            .max(100)
            .step(1)
            .default(30)
            .description('搜索文档的数量')
    }).description('基础配置'),

    Schema.object({
        standardModel:
            Schema.dynamic('model').description('运行标准知识库的模型'),
        standardMode: Schema.union([
            Schema.const('fast').description('直接对问题查询'),
            Schema.const('regenerate').description('重新生成问题查询'),
            Schema.const('contextual-compression').description('上下文压缩查询')
        ])
            .default('fast')
            .description('标准知识库的运行模式')
    }).description('标准知识库配置'),

    Schema.object({
        hippoModel: Schema.dynamic('model').description('运行 HippoRAG 的模型'),
        hippoRetrievalTopK: Schema.number()
            .role('slider')
            .min(1)
            .max(100)
            .step(1)
            .default(20)
            .description('HippoRAG 检索的 TopK 数量'),
        hippoLinkingTopK: Schema.number()
            .role('slider')
            .min(1)
            .max(50)
            .step(1)
            .default(10)
            .description('HippoRAG 链接的 TopK 数量'),
        hippoPassageNodeWeight: Schema.number()
            .role('slider')
            .min(0)
            .max(1)
            .step(0.01)
            .default(0.05)
            .description('HippoRAG 段落节点权重'),
        hippoDamping: Schema.number()
            .role('slider')
            .min(0)
            .max(1)
            .step(0.01)
            .default(0.5)
            .description('HippoRAG 阻尼系数'),
        hippoSynonymyEdgeTopK: Schema.number()
            .role('slider')
            .min(1)
            .max(50)
            .step(1)
            .default(10)
            .description('HippoRAG 同义边 TopK 数量'),
        hippoSynonymyEdgeSimThreshold: Schema.number()
            .role('slider')
            .min(0)
            .max(1)
            .step(0.01)
            .default(0.8)
            .description('HippoRAG 同义边相似度阈值')
    }).description('HippoRAG 配置'),

    Schema.object({
        lightragBaseUrl: Schema.string()
            .role('url')
            .default('http://localhost:9621')
            .description('LightRAG 服务器地址'),
        lightragApiKey: Schema.string()
            .role('secret')
            .description('LightRAG API 密钥（可选）'),
        lightragQueryMode: Schema.union([
            Schema.const('local').description('本地模式'),
            Schema.const('global').description('全局模式'),
            Schema.const('hybrid').description('混合模式'),
            Schema.const('naive').description('朴素模式'),
            Schema.const('mix').description('混合模式')
        ])
            .default('global')
            .description('LightRAG 查询模式')
    }).description('LightRAG 配置'),

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

export const inject = ['chatluna', 'database']

export const usage = `
现我们不再直接依赖相关库，你需要自己安装相关依赖到 koishi 根目录下。

## **重要提示**

安装这些额外依赖，如果失败，可能会导致 koishi 无法启动，无法安装任何依赖等问题。请谨慎操作。

要查看如何配置 pdf 文件, 看[这里](https://js.langchain.com/docs/how_to/document_loader_pdf/)

要查看如何配置 csv，看[这里](https://js.langchain.com/docs/how_to/document_loader_csv/)

要查看如何配置 docx，看[这里](https://js.langchain.com/docs/integrations/document_loaders/file_loaders/docx/)

要查看如何配置 unstructured，看[这里](https://js.langchain.com/docs/how_to/document_loader_html)

使用之前用 \`chatluna knowledge create\` 创建知识库，并上传需要的文件。

完成后在配置界面选择你上传的知识库。

先选择一次无，在选择这个知识库！！！

模型也要选择，随便选一个便宜的模型就行了。
`
