import fs from 'node:fs'
import path from 'node:path'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const eventStream = createEventStream(event)

  const logFilePath = path.join(process.cwd(), 'data', 'logs', 'app.log')

  // 跟踪已发送的日志行数，避免重复推送
  let lastSentLineCount = 0

  setImmediate(async () => {
    try {
      // 发送现有日志
      if (fs.existsSync(logFilePath)) {
        const logContent = fs.readFileSync(logFilePath, 'utf-8')
        const recentLogs = logContent
          .split('\n')
          .filter((line) => line.trim())
          .slice(-512)

        const validLines = recentLogs.filter((line) => line.trim())
        for (const line of validLines) {
          await eventStream.push(line)
          await new Promise((resolve) => setTimeout(resolve, 15))
        }

        lastSentLineCount = logContent
          .split('\n')
          .filter((line) => line.trim()).length
      }
    } catch (error) {
      console.error('Error initializing log stream:', error)
    }
  })

  const listener = async () => {
    if (fs.existsSync(logFilePath)) {
      const logContent = fs.readFileSync(logFilePath, 'utf-8')
      const allLines = logContent.split('\n').filter((line) => line.trim())
      const currentLineCount = allLines.length

      // 只推送新增的日志行
      if (currentLineCount > lastSentLineCount) {
        const newLines = allLines.slice(lastSentLineCount)

        for (const line of newLines) {
          if (line.trim()) {
            await eventStream.push(line)
          }
        }

        lastSentLineCount = currentLineCount
      }
    }
  }

  fs.watchFile(logFilePath, { interval: 1000 }, listener)

  eventStream.onClosed(async () => {
    fs.unwatchFile(logFilePath, listener)
    await eventStream.close()
  })

  return eventStream.send()
})
