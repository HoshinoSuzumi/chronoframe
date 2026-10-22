export default defineNuxtPlugin((_nuxtApp) => {
  const config = useRuntimeConfig()

  if (
    config.public.analytics.matomo?.enabled &&
    config.public.analytics.matomo.url &&
    config.public.analytics.matomo.siteId
  ) {
    const matomoUrl = config.public.analytics.matomo.url.replace(/\/$/, '') // 移除末尾斜杠
    const siteId = config.public.analytics.matomo.siteId

    useHead({
      script: [
        {
          innerHTML: `
            var _paq = window._paq = window._paq || [];
            _paq.push(['trackPageView']);
            _paq.push(['enableLinkTracking']);
            (function() {
              var u="${matomoUrl}/";
              _paq.push(['setTrackerUrl', u+'matomo.php']);
              _paq.push(['setSiteId', '${siteId}']);
              var d=document, g=d.createElement('script'), s=d.getElementsByTagName('script')[0];
              g.async=true; g.src=u+'matomo.js'; s.parentNode.insertBefore(g,s);
            })();
          `.trim(),
          type: 'text/javascript',
          tagPosition: 'head',
        },
      ],
    })
    return
  }
})
