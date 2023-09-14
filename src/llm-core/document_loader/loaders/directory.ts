import { Document } from 'langchain/dist/document'
import { DocumentLoader, DocumentLoaderFields } from '../types'
import fs from 'fs/promises'

export default class DirectoryLoader extends DocumentLoader {
    public async load(path: string, fields: DocumentLoaderFields): Promise<Document[]> {
        const fileList = (await fs.readdir(path, { withFileTypes: true, recursive: true }))
            .filter((value) => value.isFile())
            .map((value) => value.path)

        let result: Document[] = []

        for (const subPath of fileList) {
            const subDocuments = await this.parent?.load(subPath, fields)

            if (!subDocuments) {
                continue
            }

            result = result.concat(subDocuments)
        }

        return result
    }

    public async support(path: string): Promise<boolean> {
        const stat = await fs.stat(path)

        return stat.isDirectory()
    }
}
