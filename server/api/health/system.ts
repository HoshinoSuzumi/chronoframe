import * as si from 'systeminformation'
import { readFileSync } from 'fs'

export default eventHandler(async (event) => {
  const method = getMethod(event)
  
  if (method === 'GET') {
    try {
      const uptime = process.uptime()
      let memoryInfo = null
      
      // 检查是否在Docker容器中运行
      const isDocker = await checkIfDocker()
      
      if (isDocker) {
        // 在Docker容器中，尝试从/proc/meminfo读取宿主机内存信息
        memoryInfo = await getDockerMemoryInfo()
      }
      
      // 如果Docker内存获取失败，尝试使用systeminformation
      if (!memoryInfo) {
        const memInfo = await si.mem()
        memoryInfo = {
          used: memInfo.used,
          total: memInfo.total
        }
      }
      
      return {
        uptime: uptime,
        memory: memoryInfo,
        processing: {
          active: true,
          queued: 0 // 后台处理不维护队列
        },
        timestamp: new Date().toISOString(),
        environment: isDocker ? 'docker' : 'host'
      }
    } catch (error) {
      // 如果所有方法都失败，回退到Node.js进程信息
      console.warn('Failed to get system memory info, falling back to process info:', error)
      
      const memUsage = process.memoryUsage()
      const uptime = process.uptime()
      
      return {
        uptime: uptime,
        memory: {
          used: memUsage.heapUsed,
          total: memUsage.heapTotal
        },
        processing: {
          active: true,
          queued: 0
        },
        timestamp: new Date().toISOString(),
        environment: 'fallback'
      }
    }
  }
  
  throw createError({
    statusCode: 405,
    statusMessage: 'Method not allowed'
  })
})

// 检查是否在Docker容器中运行
async function checkIfDocker(): Promise<boolean> {
  try {
    // 检查是否存在Docker特有的文件
    const fs = await import('fs')
    return fs.existsSync('/.dockerenv') || fs.existsSync('/proc/1/cgroup')
  } catch {
    return false
  }
}

// 在Docker容器中获取内存信息
async function getDockerMemoryInfo(): Promise<{ used: number; total: number } | null> {
  try {
    // 尝试从/proc/meminfo读取内存信息
    const meminfo = readFileSync('/proc/meminfo', 'utf8')
    const lines = meminfo.split('\n')
    
    let totalMem = 0
    let availableMem = 0
    
    for (const line of lines) {
      if (line.startsWith('MemTotal:')) {
        totalMem = parseInt(line.split(/\s+/)[1]) * 1024 // 转换为字节
      } else if (line.startsWith('MemAvailable:')) {
        availableMem = parseInt(line.split(/\s+/)[1]) * 1024 // 转换为字节
      }
    }
    
    if (totalMem > 0) {
      return {
        total: totalMem,
        used: totalMem - availableMem
      }
    }
    
    return null
  } catch (error) {
    console.warn('Failed to read /proc/meminfo:', error)
    return null
  }
}
