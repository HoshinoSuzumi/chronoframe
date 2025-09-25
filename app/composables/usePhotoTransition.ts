import type { TransitionData } from '~/stores/viewer'

export const usePhotoTransition = () => {
  const viewerState = useViewerState()
  const router = useRouter()

  // 创建转场动画元素
  const createTransitionElement = (data: TransitionData): HTMLElement => {
    const element = document.createElement('div')
    element.className = 'photo-transition-element'
    
    // 设置基本样式
    Object.assign(element.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      zIndex: '9999',
      pointerEvents: 'none',
      borderRadius: '8px',
      overflow: 'hidden',
      transform: `translate3d(${data.sourceRect.left}px, ${data.sourceRect.top}px, 0) scale(1)`,
      width: `${data.sourceRect.width}px`,
      height: `${data.sourceRect.height}px`,
      willChange: 'transform, opacity',
      backfaceVisibility: 'hidden',
      transformOrigin: 'top left',
    })

    // 创建图片元素
    const img = document.createElement('img')
    img.src = data.imageUrl
    img.style.cssText = `
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    `

    // 如果有 thumbnailHash，先显示模糊背景
    if (data.thumbnailHash) {
      // const canvas = document.createElement('canvas')
      // 这里可以使用 ThumbHash 库渲染模糊背景
      // 为了简化，我们暂时跳过这个功能
    }

    element.appendChild(img)
    document.body.appendChild(element)
    
    return element
  }

  // 计算转场动画的目标位置
  const findTargetMainImage = (): HTMLElement | null => {
    console.log('Looking for target main image...')
    
    // 方法1: 查找 Swiper 的活跃 slide
    let activeSlide = document.querySelector('.swiper-slide-active')
    console.log('Active slide method 1:', activeSlide)
    
    // 方法2: 如果没有找到活跃的 slide，查找所有 slide 中的第一个
    if (!activeSlide) {
      const allSlides = document.querySelectorAll('.swiper-slide')
      console.log('All slides:', allSlides.length)
      if (allSlides.length > 0) {
        activeSlide = allSlides[0] as HTMLElement
        console.log('Using first slide as fallback')
      }
    }
    
    if (!activeSlide) {
      console.log('No slide found')
      return null
    }
    
    // 查找 ProgressiveImage 组件的容器
    const progressiveImage = activeSlide.querySelector('[data-progressive-image]') as HTMLElement
    console.log('Progressive image found:', progressiveImage)
    
    // 如果还是找不到，尝试查找任何图片元素
    if (!progressiveImage) {
      const anyImage = activeSlide.querySelector('img') as HTMLElement
      console.log('Fallback to any image:', anyImage)
      return anyImage
    }
    
    return progressiveImage
  }

  const getTargetRect = async (): Promise<DOMRect | null> => {
    // 等待更多帧确保 DOM 已更新，特别是 Swiper
    await new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(resolve)
        })
      })
    })

    const targetElement = findTargetMainImage()
    const rect = targetElement?.getBoundingClientRect() || null
    console.log('Target element rect:', rect)
    return rect
  }

  // 清理转场元素
  const cleanupTransitionElement = (element: HTMLElement) => {
    try {
      if (element && element.parentNode) {
        element.parentNode.removeChild(element)
      }
      if (viewerState.transitionElement === element) {
        viewerState.transitionElement = null
      }
    } catch (error) {
      console.warn('Failed to cleanup transition element:', error)
    }
  }

  // 执行转场动画
  const executeTransition = async (data: TransitionData, photoIndex: number) => {
    // 如果已经在转场中，忽略新的请求
    if (viewerState.isTransitioning) {
      console.log('Already transitioning, ignoring request')
      return
    }
    
    let transitionElement: HTMLElement | null = null
    
    try {
      // 1. 创建转场元素
      transitionElement = createTransitionElement(data)
      viewerState.transitionElement = transitionElement
      
      console.log('Created transition element at:', data.sourceRect)

      // 2. 开始转场状态，但不显示 PhotoViewer
      viewerState.startTransition(data, photoIndex)

      // 3. 导航到照片页面（这会触发 PhotoViewer 的挂载，但处于隐藏状态）
      await router.push(`/${data.photoId}`)

      // 4. 等待更长时间确保 PhotoViewer 和 Swiper 都已渲染
      await new Promise(resolve => setTimeout(resolve, 200))
      const targetRect = await getTargetRect()

      console.log('Target rect:', targetRect)

      if (!targetRect) {
        console.warn('Cannot find target element, falling back to center screen')
        // 如果找不到目标，就动画到屏幕中心
        const fallbackRect = {
          left: window.innerWidth / 2 - (data.sourceRect.width * 1.5) / 2,
          top: window.innerHeight / 2 - (data.sourceRect.height * 1.5) / 2,
          width: data.sourceRect.width * 1.5,
          height: data.sourceRect.height * 1.5
        }
        
        const moveAnimation = transitionElement.animate(
          [
            {
              transform: `translate3d(${data.sourceRect.left}px, ${data.sourceRect.top}px, 0) scale(1)`,
              opacity: 1
            },
            {
              transform: `translate3d(${fallbackRect.left}px, ${fallbackRect.top}px, 0) scale(1.5)`,
              opacity: 1
            }
          ],
          {
            duration: 400,
            easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
            fill: 'forwards'
          }
        )

        await moveAnimation.finished

        // 显示 PhotoViewer 并淡出转场元素
        viewerState.completeTransition()
        
        const fadeAnimation = transitionElement.animate(
          [{ opacity: 1 }, { opacity: 0 }],
          { duration: 150, easing: 'ease-out', fill: 'forwards' }
        )

        await fadeAnimation.finished
      } else {
        // 5. 执行动画到目标位置
        // 计算目标的实际尺寸和位置
        const targetLeft = targetRect.left
        const targetTop = targetRect.top
        const targetWidth = targetRect.width
        const targetHeight = targetRect.height

        console.log('Animating from:', data.sourceRect, 'to:', targetRect)

        // 计算缩放比例
        const scaleX = targetWidth / data.sourceRect.width
        const scaleY = targetHeight / data.sourceRect.height
        
        // 第一阶段：移动并缩放到目标位置和尺寸
        const moveAnimation = transitionElement.animate(
          [
            {
              transform: `translate3d(${data.sourceRect.left}px, ${data.sourceRect.top}px, 0) scale(1)`,
              opacity: 1
            },
            {
              transform: `translate3d(${targetLeft}px, ${targetTop}px, 0) scale(${Math.max(scaleX, scaleY)})`,
              opacity: 1
            }
          ],
          {
            duration: 500,
            easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
            fill: 'forwards'
          }
        )

        await moveAnimation.finished

        // 第二阶段：在目标位置停留一小会儿，然后淡出
        const fadeAnimation = transitionElement.animate(
          [
            {
              opacity: 1
            },
            {
              opacity: 0
            }
          ],
          {
            duration: 150,
            easing: 'ease-out',
            fill: 'forwards'
          }
        )

        // 在淡出动画开始的同时显示真正的 PhotoViewer
        setTimeout(() => {
          viewerState.completeTransition()
        }, 50) // 在淡出动画开始后 50ms 显示真正的 viewer

        await fadeAnimation.finished
      }

      // 6. 清理转场元素
      if (transitionElement) {
        cleanupTransitionElement(transitionElement)
      }

    } catch (error) {
      console.error('Transition animation failed:', error)
      
      // 失败时直接显示 PhotoViewer
      viewerState.completeTransition()
      
      // 清理转场元素
      if (transitionElement) {
        cleanupTransitionElement(transitionElement)
      }
    }
  }

  return {
    executeTransition,
  }
}