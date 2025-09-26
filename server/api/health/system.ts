import * as si from 'systeminformation'

export default eventHandler(async (event) => {
  const method = getMethod(event)
  
  if (method === 'GET') {
    try {
      // 获取系统内存信息
      const memInfo = await si.mem()
      const uptime = process.uptime()
      
      return {
        uptime: uptime,
        memory: {
          used: memInfo.used,
          total: memInfo.total
        },
        processing: {
          active: true,
          queued: 0 // 后台处理不维护队列
        },
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      // 如果获取系统信息失败，回退到Node.js进程信息
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
        timestamp: new Date().toISOString()
      }
    }
  }
  
  throw createError({
    statusCode: 405,
    statusMessage: 'Method not allowed'
  })
})
