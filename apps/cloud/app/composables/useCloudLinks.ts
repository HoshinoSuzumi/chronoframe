/** Production actions cross to the portal; preview/local auth stays on its own isolated origin. */
export function useCloudLinks() {
  const hostname = useRequestURL().hostname
  const portal = ['chronoframe.art', 'app.chronoframe.art'].includes(hostname)
    ? 'https://app.chronoframe.art'
    : ''
  return {
    website: 'https://chronoframe.art/',
    signin: portal + '/signin',
    signup: portal + '/signup',
  }
}
