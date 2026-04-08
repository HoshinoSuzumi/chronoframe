import { sql, gte } from 'drizzle-orm'
import * as si from 'systeminformation'
import { readFileSync } from 'node:fs'

async function getQueueStats() {
  const workerPool = globalThis.__workerPool
  return workerPool ? workerPool.getPoolStats() : null
}

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
async function getDockerMemoryInfo(): Promise<{
  used: number
  total: number
} | null> {
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
        used: totalMem - availableMem,
      }
    }

    return null
  } catch (error) {
    console.warn('Failed to read /proc/meminfo:', error)
    return null
  }
}

async function getMemoryStats() {
  let memoryInfo: {
    used: number
    total: number
  } | null = null
  try {
    const isDocker = await checkIfDocker()

    if (isDocker) {
      memoryInfo = await getDockerMemoryInfo()
    }

    if (!memoryInfo) {
      const sysMemInfo = await si.mem()
      memoryInfo = {
        used: sysMemInfo.used,
        total: sysMemInfo.total,
      }
    }
  } catch (error) {
    console.warn(
      'Failed to get system memory info, falling back to process info:',
      error,
    )
    const memUsage = process.memoryUsage()
    memoryInfo = {
      used: memUsage.heapUsed,
      total: memUsage.heapTotal,
    }
  }

  return memoryInfo
}

// 系统信息映射函数
function mapSystemInfo(distribution: string): string {
  if (!distribution) return 'unknown'

  // 转换为小写以便匹配
  const distro = distribution.toLowerCase()

  // Windows 系统映射
  if (distro.includes('windows') || distro.includes('microsoft')) {
    if (distro.includes('11')) return 'windows11'
    if (distro.includes('10')) return 'windows10'
    return 'windows'
  }

  // Linux 发行版映射
  if (distro.includes('ubuntu')) return 'ubuntu'
  if (distro.includes('debian')) return 'debian'
  if (distro.includes('centos')) return 'centos'
  if (distro.includes('redhat') || distro.includes('rhel')) return 'redhat'
  if (distro.includes('fedora')) return 'fedora'
  if (distro.includes('arch')) return 'arch'
  if (distro.includes('alpine')) return 'alpine'
  if (distro.includes('suse') || distro.includes('opensuse')) return 'opensuse'

  // macOS 系统映射
  if (distro.includes('macos') || distro.includes('darwin')) return 'macos'

  // 其他情况返回原始值（处理未知系统）
  return 'unknown'
}

export default eventHandler(async (event) => {
  await requireUserSession(event)

  // 获取基础统计
  const totalPhotos = await useDB()
    .select({ count: sql<number>`count(*)` })
    .from(tables.photos)
    .get()

  // 获取今日新增照片数量
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayISO = today.toISOString()

  const todayPhotos = await useDB()
    .select({ count: sql<number>`count(*)` })
    .from(tables.photos)
    .where(gte(tables.photos.dateTaken, todayISO))
    .get()

  // 获取本周新增照片数量
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  weekAgo.setHours(0, 0, 0, 0)
  const weekAgoISO = weekAgo.toISOString()

  const weekPhotos = await useDB()
    .select({ count: sql<number>`count(*)` })
    .from(tables.photos)
    .where(gte(tables.photos.dateTaken, weekAgoISO))
    .get()

  // 获取本月新增照片数量
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const monthStartISO = monthStart.toISOString()

  const monthPhotos = await useDB()
    .select({ count: sql<number>`count(*)` })
    .from(tables.photos)
    .where(gte(tables.photos.dateTaken, monthStartISO))
    .get()

  // 获取存储统计（估算）
  const storageStats = await useDB()
    .select({
      totalSize: sql<number>`COALESCE(sum(file_size), 0)`,
      avgSize: sql<number>`COALESCE(avg(file_size), 0)`,
      maxSize: sql<number>`COALESCE(max(file_size), 0)`,
    })
    .from(tables.photos)
    .get()

  // 获取最近7天的上传趋势
  today.setHours(0, 0, 0, 0)
  const sevenDaysAgo = new Date(today)
  sevenDaysAgo.setDate(today.getDate() - 6)
  sevenDaysAgo.setHours(0, 0, 0, 0)
  const sevenDaysAgoISO = sevenDaysAgo.toISOString()

  // Query counts grouped by date for the last 7 days
  const rawTrendData = await useDB()
    .select({
      date: sql<string>`DATE(${tables.photos.dateTaken})`,
      count: sql<number>`count(*)`,
    })
    .from(tables.photos)
    .where(gte(tables.photos.dateTaken, sevenDaysAgoISO))
    .groupBy(sql`DATE(${tables.photos.dateTaken})`)
    .orderBy(sql`DATE(${tables.photos.dateTaken}) ASC`)
    .all()

  // Build trendData for each of the last 7 days, filling in zeros if needed
  const trendData = []
  for (let i = 0; i < 7; i++) {
    const date = new Date(sevenDaysAgo)
    date.setDate(sevenDaysAgo.getDate() + i)
    const dateStr = date.toISOString().split('T')[0]
    const found = rawTrendData.find((row) => row.date === dateStr)
    trendData.push({
      date: dateStr,
      count: found ? found.count : 0,
    })
  }

  // 获取系统信息并映射
  let systemInfo = 'unknown'
  if (await checkIfDocker()) {
    systemInfo = 'docker'
  } else {
    try {
      const osInfo = await si.osInfo()
      systemInfo = mapSystemInfo(osInfo.distro)
    } catch (error) {
      console.warn('Failed to get OS info:', error)
      systemInfo = 'unknown'
    }
  }

  return {
    uptime: process.uptime() || 0,
    runningOn: systemInfo,
    memory: (await getMemoryStats()) || { used: 0, total: 0 },
    photos: {
      total: totalPhotos?.count || 0,
      today: todayPhotos?.count || 0,
      thisWeek: weekPhotos?.count || 0,
      thisMonth: monthPhotos?.count || 0,
    },
    workerPool: (await getQueueStats()) || null,
    storage: {
      totalSize: storageStats?.totalSize || 0,
      averageSize: storageStats?.avgSize || 0,
      maxSize: storageStats?.maxSize || 0,
    },
    trends: trendData.toReversed(),
    timestamp: new Date().toISOString(),
  }
})
