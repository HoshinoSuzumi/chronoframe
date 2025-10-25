export default eventHandler(async (event) => {
  await requireUserSession(event)
  
  const config = useRuntimeConfig(event)
  
  // 检查各存储提供器的配置状态
  const healthChecks = [
    {
      provider: 's3',
      healthy: !!(config.provider?.s3?.bucket && config.provider?.s3?.accessKeyId),
      config: {
        type: 's3',
        configured: !!(config.provider?.s3?.bucket && config.provider?.s3?.accessKeyId),
        hasBucket: !!config.provider?.s3?.bucket,
        hasCredentials: !!(config.provider?.s3?.accessKeyId && config.provider?.s3?.secretAccessKey),
      },
      lastChecked: new Date().toISOString(),
    },
    {
      provider: 'local',
      healthy: !!config.provider?.local?.localPath,
      config: {
        type: 'local',
        configured: !!config.provider?.local?.localPath,
        hasPath: !!config.provider?.local?.localPath,
      },
      lastChecked: new Date().toISOString(),
    },
    {
      provider: 'openlist',
      healthy: !!(config.provider?.openlist?.baseUrl && config.provider?.openlist?.token),
      config: {
        type: 'openlist',
        configured: !!(config.provider?.openlist?.baseUrl && config.provider?.openlist?.token),
        hasBaseUrl: !!config.provider?.openlist?.baseUrl,
        hasToken: !!config.provider?.openlist?.token,
      },
      lastChecked: new Date().toISOString(),
    }
  ]
  
  // 只返回已配置的存储提供器
  const availableProviders = healthChecks
    .filter(check => check.healthy)
    .map(check => check.provider)
  
  return {
    availableProviders,
    healthChecks,
    timestamp: new Date().toISOString(),
  }
})
