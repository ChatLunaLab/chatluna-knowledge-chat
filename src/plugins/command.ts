import { ChatChain } from '@dingyi222666/koishi-plugin-chathub/lib/chains/chain'
import { Context } from 'koishi'
import { Config, knowledgeService } from '..'
import { ChatHubPlugin } from '@dingyi222666/koishi-plugin-chathub/lib/services/chat'

export async function apply(
    ctx: Context,
    config: Config,
    plugin: ChatHubPlugin,
    chain: ChatChain
): Promise<void> {
    ctx.command('chathub.knowledge', 'QA问题相关命令')

    ctx.command('chathub.knowledge.upload <path:string>', '上传资料')
        .option('size', '-s --size <number> 文本块的切割大小（字符）')
        .option('overlap', '-o --overlap <string> 文件路径')
        .option('copy', '-c --copy <boolean> 是否把数据复制到缓存路径')
        .action(async ({ options, session }, path) => {
            // TODO: copy documents
            const loader = knowledgeService.loader

            const supported = await loader.support(path)

            if (!supported) {
                return `不支持的文件类型：${path}`
            }

            const documents = await loader.load(path, {
                chunkOverlap: options.overlap ?? config.chunkOverlap,
                chunkSize: options.size ?? config.chunkSize
            })

            // TODO: Send load result

            console.log(JSON.stringify(documents))

            // TODO: save to database
        })

    ctx.command('chathub.knowledge.delete [path:string]', '删除资料')
        .option('db', '-d --db <string> 数据库名')
        .action(async ({ session }, path) => {})
}
