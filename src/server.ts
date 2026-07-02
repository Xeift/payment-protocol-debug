import type { Express } from 'express'
import type { Server } from 'node:http'

export async function listen(app: Express, port: number, label: string): Promise<Server> {
    return await new Promise((resolve, reject) => {
        const server = app.listen(port, () => {
            console.log(`${label} listening on http://localhost:${port}\n`)
            resolve(server)
        })

        server.once('error', reject)
    })
}

export async function closeServer(server: Server): Promise<void> {
    await new Promise((resolve, reject) => {
        server.close((error) => {
            if (error) {
                reject(error)
                return
            }

            resolve(undefined)
        })
    })
}
