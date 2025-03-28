/* eslint-disable @typescript-eslint/no-explicit-any */

"use client"

import { useRef, useState, useEffect, SetStateAction } from "react"
import { Camera, Download, RefreshCw, Upload, Play, AlertCircle, ImageIcon, Check } from "lucide-react"

import { Button } from "@/components/button"
import { Card, CardContent } from "@/components/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/tabs"
import { FilterSelector } from "@/components/filter-selector"
import { FrameSelector } from "@/components/frame-selector"
import { FrameUploader } from "@/components/frame-uploader"
import { Progress } from "@/components/progress"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui"

// Import frame SVGs directly
import { TEMPLATE_FRAMES } from "@/components/frame-templates"
import { savePhoto } from "@/lib/storage"

export function PhotoBooth() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stripCanvasRef = useRef<HTMLCanvasElement>(null)
  const [capturedImages, setCapturedImages] = useState<string[]>([])
  const [stripImage, setStripImage] = useState<string | null>(null)
  const [currentFilter, setCurrentFilter] = useState<string>("none")
  const [currentFrame, setCurrentFrame] = useState<string | null>(null)
  const [customFrames, setCustomFrames] = useState<string[]>([])
  const [cameraPermission, setCameraPermission] = useState<boolean | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [uploadStatus, setUploadStatus] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("frames") // Start with frames tab
  const [isCameraLoading, setIsCameraLoading] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [frameSelected, setFrameSelected] = useState(false)
  const [setupComplete, setSetupComplete] = useState(false)
  const [debugInfo, setDebugInfo] = useState<string | null>(null)

  // Load custom frames from localStorage on component mount
  useEffect(() => {
    try {
      const savedFrames = localStorage.getItem("customFrames")
      if (savedFrames) {
        const frames = JSON.parse(savedFrames)
        setCustomFrames(frames)

        // If we have previously saved frames, check if one was selected
        const savedSelectedFrame = localStorage.getItem("selectedFrame")
        if (savedSelectedFrame) {
          // Check if the saved frame still exists
          const frameExists = frames.some((frameStr: string) => {
            try {
              const frameData = JSON.parse(frameStr)
              return frameData.url === savedSelectedFrame
            } catch {
              return frameStr === savedSelectedFrame
            }
          }) || TEMPLATE_FRAMES.some(frame => frame.url === savedSelectedFrame)

          if (frameExists) {
            setCurrentFrame(savedSelectedFrame)
            setFrameSelected(true)
          } else {
            // Clear invalid selection
            localStorage.removeItem("selectedFrame")
          }
        }
      }
    } catch (e) {
      console.error("Error loading saved frames:", e)
      setDebugInfo(`Error loading saved frames: ${e instanceof Error ? e.message : String(e)}`)
    }
  }, [])

  // Save custom frames to localStorage when they change
  useEffect(() => {
    if (customFrames.length > 0) {
      try {
        localStorage.setItem("customFrames", JSON.stringify(customFrames))
      } catch (error) {
        if (error instanceof Error && error.name === 'QuotaExceededError') {
          // Remove the last added frame since it couldn't be saved
          setCustomFrames(prev => prev.slice(0, -1))
          alert("Storage limit reached. Please delete some existing frames first.")
        } else {
          console.error("Error saving frames:", error)
        }
      }
    } else {
      // Clear storage if no custom frames
      localStorage.removeItem("customFrames")
    }

    // Save the selected frame reference
    if (currentFrame) {
      try {
        // For custom frames, store just the index
        const customFrameIndex = customFrames.findIndex(frameStr => {
          try {
            const frameData = JSON.parse(frameStr)
            return frameData.url === currentFrame
          } catch {
            return frameStr === currentFrame
          }
        })

        if (customFrameIndex !== -1) {
          localStorage.setItem("selectedFrame", `custom:${customFrameIndex}`)
        } else {
          // For template frames, store the template ID
          const templateFrame = TEMPLATE_FRAMES.find(frame => frame.url === currentFrame)
          if (templateFrame) {
            localStorage.setItem("selectedFrame", `template:${templateFrame.id}`)
          }
        }
      } catch (error) {
        // If storage fails, we can continue without saving the selection
        console.error("Error saving frame selection:", error)
      }
    } else {
      localStorage.removeItem("selectedFrame")
    }
  }, [customFrames, currentFrame])

  // Update canvas with video feed and apply filter
  useEffect(() => {
    if (!isCameraActive || !setupComplete) return

    let animationFrameId: number;
    let lastUpdate = 0;
    const minUpdateInterval = 100; // Minimum time between updates in ms

    const updateCanvas = (timestamp: number) => {
      // Only update if enough time has passed
      if (timestamp - lastUpdate >= minUpdateInterval) {
        const canvas = canvasRef.current
        const video = videoRef.current
        
        if (canvas && video && video.readyState >= 2 && !video.paused) {
          const context = canvas.getContext('2d')
          if (context) {
            // Set canvas dimensions to match video
            if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
              canvas.width = video.videoWidth
              canvas.height = video.videoHeight
            }

            // Always draw the video frame to maintain consistency
            try {
              context.drawImage(video, 0, 0, canvas.width, canvas.height)
              if (currentFilter !== 'none') {
                applyFilter(context, currentFilter, canvas.width, canvas.height)
              }
            } catch (err) {
              console.error('Draw error:', err)
            }
          }

          // Update debug info less frequently
          if (timestamp - lastUpdate >= 1000) {
            setDebugInfo(`Video dimensions: ${video.videoWidth}x${video.videoHeight}, ` +
              `Canvas dimensions: ${canvas.width}x${canvas.height}, ` +
              `Video ready state: ${video.readyState}, ` +
              `Video paused: ${video.paused}, ` +
              `Video element dimensions: ${video.offsetWidth}x${video.offsetHeight}, ` +
              `Canvas element dimensions: ${canvas.offsetWidth}x${canvas.offsetHeight}, ` +
              `Video playing: ${!video.paused}, ` +
              `Video current time: ${video.currentTime}, ` +
              `Video error: ${video.error?.message || 'none'}, ` +
              `User Agent: ${navigator.userAgent}`)
          }
        }
        lastUpdate = timestamp
      }
      
      animationFrameId = requestAnimationFrame(updateCanvas)
    }

    animationFrameId = requestAnimationFrame(updateCanvas)

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
    }
  }, [currentFilter, isCameraActive, setupComplete])

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop())
      }
    }
  }, [cameraStream])

  // Add a new effect to handle tab changes
  useEffect(() => {
    if (activeTab === "camera" && setupComplete && !isCameraActive && !isCameraLoading) {
      initializeCamera()
    }
  }, [activeTab, setupComplete])

  // Initialize camera access
  const initializeCamera = async () => {
    if (isCameraLoading) return // Prevent multiple simultaneous initialization attempts
    
    setIsCameraLoading(true)
    setCameraError(null)
    setDebugInfo("Initializing camera...")

    try {
      // Stop any existing stream
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop())
        setCameraStream(null)
      }

      // Clear video source and reset state
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
      setIsCameraActive(false)

      // Log available devices
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoDevices = devices.filter(device => device.kind === 'videoinput')
        setDebugInfo(`Available video devices: ${videoDevices.length}\n${
          videoDevices.map(d => `${d.label || 'Unnamed device'} (${d.deviceId})`).join('\n')
        }`)
      } catch (err) {
        setDebugInfo(`Error enumerating devices: ${err instanceof Error ? err.message : String(err)}`)
      }

      // Request camera access
      const constraints = {
        video: {
          width: { min: 640, ideal: 1280, max: 1920 },
          height: { min: 480, ideal: 960, max: 1440 },
          aspectRatio: { min: 0.75, max: 1.333333 },  // Allow ratios between 3:4 and 4:3
          facingMode: "user",
        },
        audio: false,
      }

      setDebugInfo("Requesting camera access...")
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      
      // Log stream information
      const videoTrack = stream.getVideoTracks()[0]
      const settings = videoTrack.getSettings()
      setDebugInfo(`Camera access granted:\nTrack settings: ${JSON.stringify(settings, null, 2)}`)
      
      setCameraStream(stream)

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          setDebugInfo(`Video metadata loaded:\nDimensions: ${videoRef.current?.videoWidth}x${videoRef.current?.videoHeight}\nReady State: ${videoRef.current?.readyState}`)
        }

        // Wait for video to be ready
        await new Promise<void>((resolve, reject) => {
          if (!videoRef.current) return reject("Video element not found")

          const onLoadedMetadata = () => {
            setDebugInfo(`Video metadata loaded and ready to play`)
            videoRef.current?.removeEventListener('loadedmetadata', onLoadedMetadata)
            videoRef.current?.play().then(() => {
              setDebugInfo(`Video playback started successfully`)
              resolve()
            }).catch((err) => {
              setDebugInfo(`Failed to start video playback: ${err.message}`)
              reject(err)
            })
          }

          videoRef.current.addEventListener('loadedmetadata', onLoadedMetadata)

          // Set a timeout in case onloadedmetadata doesn't fire
          const timeoutId = setTimeout(() => {
            videoRef.current?.removeEventListener('loadedmetadata', onLoadedMetadata)
            if ((videoRef.current?.readyState ?? 0) >= 2) {
              videoRef.current?.play().then(() => {
                setDebugInfo("Video playback started after timeout")
                resolve()
              }).catch((err) => {
                setDebugInfo(`Failed to start video playback after timeout: ${err.message}`)
                reject(err)
              })
            } else {
              setDebugInfo(`Video not ready: readyState=${videoRef.current?.readyState ?? 'undefined'}`)
              reject("Video metadata loading timeout")
            }
          }, 5000)

          // Cleanup timeout if we resolve successfully
          return () => clearTimeout(timeoutId)
        })

        setIsCameraActive(true)
        setCameraPermission(true)
        setDebugInfo("Camera initialization complete")
      } else {
        throw new Error("Video element not found")
      }
    } catch (err) {
      console.error("Camera initialization error:", err)
      setDebugInfo(`Camera error: ${err instanceof Error ? err.message : "Unknown error"}`)
      setCameraPermission(false)
      setCameraError(err instanceof Error ? err.message : "Failed to access camera")
      setIsCameraActive(false)
    } finally {
      setIsCameraLoading(false)
    }
  }

  // Handle frame upload
  const handleFrameUpload = (frameDataStr: string) => {
    try {
      // Test if we can store the new frame
      const testStorage = [...customFrames, frameDataStr]
      // Try to store it - if this doesn't throw, we have enough space
      localStorage.setItem("customFrames", JSON.stringify(testStorage))
      localStorage.removeItem("customFrames") // Clean up test
      
      // Actually store it through state update
      setCustomFrames(testStorage)
      
      // Parse the frame data to get the URL
      const frameData = JSON.parse(frameDataStr)
      setCurrentFrame(frameData.url)
      setFrameSelected(true)
    } catch (error) {
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        alert("Storage limit reached. Please delete some existing frames first.")
      } else {
        console.error("Error handling frame upload:", error)
        alert("Error uploading frame. Please try again.")
      }
    }
  }

  // Handle frame selection
  const handleFrameChange = (frameUrl: string | null) => {
    setCurrentFrame(frameUrl)
    setFrameSelected(!!frameUrl)
  }

  // Complete setup and move to camera tab
  const completeSetup = () => {
    if (!frameSelected) {
      alert("Please select a frame before continuing")
      return
    }

    setSetupComplete(true)
    setActiveTab("camera")
  }

  // Run a countdown and return a promise that resolves when done.
  const runCountdown = (seconds: SetStateAction<number | null>) => {
    return new Promise<void>((resolve) => {
      setCountdown(seconds)
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(interval)
            resolve()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    })
  }

  // Capture the current video frame into the canvas and return a data URL.
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) {
      console.error("Video or canvas element not found")
      setDebugInfo("Capture error: Video or canvas element not found")
      return null
    }

    const video = videoRef.current
    const canvas = canvasRef.current
    const context = canvas.getContext("2d")

    if (!context) {
      console.error("Could not get canvas context")
      setDebugInfo("Capture error: Could not get canvas context")
      return null
    }

    if (video.readyState < 2) {
      console.error("Video not ready for capture")
      setDebugInfo(`Capture error: Video not ready (readyState=${video.readyState})`)
      return null
    }

    // Set canvas size to match the video
    const width = video.videoWidth || 640
    const height = video.videoHeight || 480
    canvas.width = width
    canvas.height = height

    // Draw the current frame from the video
    try {
      context.drawImage(video, 0, 0, width, height)

      // Apply the current filter
      applyFilter(context, currentFilter, width, height)

      // Return the image as a data URL
      return canvas.toDataURL("image/png")
    } catch (err) {
      console.error("Error capturing photo:", err)
      setDebugInfo(`Capture error: ${err instanceof Error ? err.message : String(err)}`)
      return null
    }
  }

  // Sequentially capture 4 photos.
  const runPhotoSequence = async () => {
    if (!isCameraActive || !cameraStream || !videoRef.current) {
      setCameraError("Camera is not active. Please start the camera first.")
      return
    }

    if (videoRef.current.readyState < 2) {
      setCameraError("Video stream is not ready. Please wait a moment and try again.")
      return
    }

    if (!frameSelected) {
      setCameraError("Please select a frame before taking photos.")
      return
    }

    setIsCapturing(true)
    setStripImage(null)
    setCameraError(null)
    setCapturedImages([])

    const photos: string[] = []
    const video = videoRef.current

    try {
      // Initial play attempt if needed
      if (video.paused) {
        await video.play()
      }

      for (let i = 0; i < 4; i++) {
        // Run countdown first
        await runCountdown(3)

        // Ensure video is playing before capture
        if (video.paused) {
          await video.play()
        }

        // Wait for the next frame before capturing
        await new Promise(requestAnimationFrame)

        // Capture the photo
        const photo = capturePhoto()
        if (!photo) {
          throw new Error("Failed to capture photo")
        }

        photos.push(photo)
        setCapturedImages([...photos])

        // Don't wait after the last photo
        if (i < 3) {
          await new Promise(resolve => setTimeout(resolve, 250))
        }
      }

      if (photos.length === 4) {
        await createPhotoStrip(photos)
      }
    } catch (error) {
      console.error("Photo sequence error:", error)
      setCameraError(error instanceof Error ? error.message : "Failed to complete photo sequence")
    } finally {
      setIsCapturing(false)
      // Ensure video is playing after sequence
      if (video.paused) {
        video.play().catch(console.error)
      }
    }
  }

  // Draw the image maintaining aspect ratio
  const drawPhotoWithFrame = async (ctx: CanvasRenderingContext2D, img: HTMLImageElement, frameIndex: number) => {
    // Get frame info if a frame is selected
    let frameInfo = null
    if (currentFrame) {
      const selectedFrame = TEMPLATE_FRAMES.find(f => f.url === currentFrame)
      if (selectedFrame) {
        frameInfo = selectedFrame.photoArea
      }
    }

    // Default photo area if no frame selected
    const defaultPhotoArea = {
      width: 1000,
      height: 700,
      x: 100,
      y: 80,
      spacing: 760
    }

    const photoArea = frameInfo || defaultPhotoArea

    // Calculate y position based on frame index
    const y = photoArea.y + (frameIndex * photoArea.spacing)

    // Calculate dimensions to maintain aspect ratio
    const imgAspectRatio = img.width / img.height
    const photoAspectRatio = photoArea.width / photoArea.height

    let drawWidth, drawHeight, offsetX, offsetY

    if (imgAspectRatio > photoAspectRatio) {
      // Image is wider than the photo area - fit to height
      drawHeight = photoArea.height
      drawWidth = drawHeight * imgAspectRatio
      offsetX = photoArea.x + (photoArea.width - drawWidth) / 2
      offsetY = y
    } else {
      // Image is taller than the photo area - fit to width
      drawWidth = photoArea.width
      drawHeight = drawWidth / imgAspectRatio
      offsetX = photoArea.x
      offsetY = y + (photoArea.height - drawHeight) / 2
    }

    // Draw the image
    ctx.save()
    ctx.beginPath()
    ctx.rect(photoArea.x, y, photoArea.width, photoArea.height)
    ctx.clip()
    ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight)
    ctx.restore()
  }

  // Create a photo strip by stacking the 4 images.
  const createPhotoStrip = async (photos: string[]) => {
    try {
      if (!photos || photos.length < 4) {
        throw new Error("Not enough photos to create a strip")
      }

      // Initialize strip canvas
      const stripCanvas = stripCanvasRef.current
      if (!stripCanvas) {
        throw new Error("Strip canvas not found")
      }

      // Set canvas size to match template dimensions
      stripCanvas.width = 1200
      stripCanvas.height = 3600

      const ctx = stripCanvas.getContext("2d")
      if (!ctx) {
        throw new Error("Could not get canvas context")
      }

      // Clear canvas with white background
      ctx.fillStyle = "white"
      ctx.fillRect(0, 0, stripCanvas.width, stripCanvas.height)

      // If a frame is selected, draw it first
      if (currentFrame) {
        const frameImg = new Image()
        // Check if the frame is a data URL or needs CORS handling
        if (!currentFrame.startsWith('data:')) {
          frameImg.crossOrigin = "anonymous"
        }
        
        await new Promise<void>((resolve) => {
          frameImg.onload = () => {
            try {
              // For PNG frames, we need to handle the aspect ratio differently
              const isPNG = customFrames.some(frameStr => {
                try {
                  const frameData = JSON.parse(frameStr);
                  return frameData.url === currentFrame && frameData.type === 'png';
                } catch {
                  return false;
                }
              });

              if (isPNG) {
                // Draw PNG frame maintaining aspect ratio
                const scale = Math.min(
                  stripCanvas.width / frameImg.width,
                  stripCanvas.height / frameImg.height
                );
                const x = (stripCanvas.width - frameImg.width * scale) / 2;
                const y = (stripCanvas.height - frameImg.height * scale) / 2;
                ctx.drawImage(
                  frameImg,
                  x, y,
                  frameImg.width * scale,
                  frameImg.height * scale
                );
              } else {
                // Draw SVG frame normally
                ctx.drawImage(frameImg, 0, 0, stripCanvas.width, stripCanvas.height);
              }
              resolve()
            } catch (error) {
              console.error("Error drawing frame:", error)
              setDebugInfo(`Error drawing frame: ${error instanceof Error ? error.message : 'Unknown error'}`)
              resolve()
            }
          }
          
          frameImg.onerror = () => {
            console.error("Error loading frame:", currentFrame)
            setDebugInfo(`Error loading frame: ${currentFrame}`)
            resolve()
          }
          
          frameImg.src = currentFrame
        })
      }

      // Load and draw each image
      for (let i = 0; i < 4; i++) {
        await new Promise<void>((resolve) => {
          const img = new Image()
          img.crossOrigin = "anonymous"
          img.onload = async () => {
            await drawPhotoWithFrame(ctx, img, i)
            resolve()
          }
          
          img.onerror = () => {
            console.error("Error loading image")
            setDebugInfo(`Error loading image: ${photos[i].substring(0, 50)}...`)
            resolve()
          }
          img.src = photos[i]
        })
      }

      // Add branding at the bottom only if no custom frame is selected
      if (!currentFrame || TEMPLATE_FRAMES.some(frame => frame.url === currentFrame)) {
        // Format date consistently
        const now = new Date()
        const formattedDate = now.toLocaleDateString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        })

        // Add branding at the bottom
        ctx.fillStyle = "black"
        ctx.font = "bold 72px sans-serif"
        ctx.textAlign = "center"
        ctx.fillText("SnapTogether", stripCanvas.width / 2, 3320)
        
        // Add date with consistent formatting
        ctx.font = "36px sans-serif"
        ctx.fillText(formattedDate, stripCanvas.width / 2, 3380)
      }

      // Convert the completed strip to a data URL
      const dataUrl = stripCanvas.toDataURL("image/jpeg", 0.95)
      setStripImage(dataUrl)
      setActiveTab("strip")
    } catch (error) {
      console.error("Error creating photo strip:", error)
      setDebugInfo(`Strip error: ${error instanceof Error ? error.message : "Unknown error"}`)
      setStripImage(null)
      setActiveTab("camera")
    }
  }

  // Filter function that modifies the image data.
  const applyFilter = (context: CanvasRenderingContext2D, filter: string, width: number, height: number) => {
    // Skip if no filter selected
    if (filter === "none") return

    // Get the image data to manipulate
    const imageData = context.getImageData(0, 0, width, height)
    const data = imageData.data

    switch (filter) {
      case "grayscale":
        for (let i = 0; i < data.length; i += 4) {
          const avg = (data[i] + data[i + 1] + data[i + 2]) / 3
          data[i] = avg // red
          data[i + 1] = avg // green
          data[i + 2] = avg // blue
        }
        break

      case "sepia":
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          data[i] = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189)
          data[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168)
          data[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131)
        }
        break

      case "invert":
        for (let i = 0; i < data.length; i += 4) {
          data[i] = 255 - data[i] // red
          data[i + 1] = 255 - data[i + 1] // green
          data[i + 2] = 255 - data[i + 2] // blue
        }
        break

      case "vintage":
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          data[i] = Math.min(255, r * 0.9 + 40)
          data[i + 1] = Math.min(255, g * 0.7 + 20)
          data[i + 2] = Math.min(255, b * 0.6 + 10)
        }
        break

      case "blueprint":
        for (let i = 0; i < data.length; i += 4) {
          const avg = (data[i] + data[i + 1] + data[i + 2]) / 3
          data[i] = 0 // No red (zero)
          data[i + 1] = avg * 0.4 // Low green
          data[i + 2] = Math.min(255, avg * 1.2) // High blue
        }
        break
    }

    // Put the modified data back
    context.putImageData(imageData, 0, 0)
  }

  // Reset the photobooth state.
  const resetCamera = async () => {
    // Set camera tab first
    setActiveTab("camera")
    
    // Then reset all other states
    setCapturedImages([])
    setStripImage(null)
    setIsCapturing(false)
    setCountdown(0)
    setUploadStatus(null)

    // Stop current stream if it exists
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop())
      setCameraStream(null)
    }

    // Clear video source
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    // Small delay to ensure state updates have propagated
    await new Promise(resolve => setTimeout(resolve, 100))

    // Reinitialize camera
    await initializeCamera()
  }

  // Download the photo strip.
  const downloadStrip = () => {
    if (stripImage) {
      const link = document.createElement("a")
      link.href = stripImage
      link.download = `snaptogether-strip-${Date.now()}.jpg`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  // Update the upload function to actually save photos
  const uploadStrip = async () => {
    if (!stripImage) return
    setUploadStatus("Uploading...")
    try {
      await savePhoto(stripImage)
      setUploadStatus("Upload successful! Your strip has been saved.")
    } catch (error) {
      console.error("Error uploading image:", error)
      setUploadStatus("Upload failed. Please try again.")
    }
  }

  const handleFilterChange = (filter: SetStateAction<string>) => {
    setCurrentFilter(filter)
  }

  if (cameraPermission === false) {
    return (
      <Card className="mx-auto max-w-3xl">
        <CardContent className="p-6 text-center">
          <div className="mb-4 flex justify-center">
            <Camera className="h-12 w-12 text-muted-foreground" />
          </div>
          <h3 className="mb-2 text-xl font-semibold">Camera Access Required</h3>
          <p className="mb-4 text-muted-foreground">
            Please allow camera access to use the photo booth. You may need to update your browser settings.
          </p>
          <Button onClick={() => window.location.reload()}>Try Again</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <canvas 
        ref={stripCanvasRef} 
        style={{ display: "none" }} 
        width={800 + (40 * 2) + (60 * 2)} // photoWidth + padding*2 + borderWidth*2
        height={(600 * 4) + (40 * 5) + 120} // (photoHeight * 4) + (padding * 5) + bottomBrandingHeight
      />

      <Tabs 
        value={activeTab} 
        onValueChange={(value) => {
          setActiveTab(value)
          // Reset states when switching to frames tab
          if (value === "frames") {
            setStripImage(null)
            setCapturedImages([])
            setIsCapturing(false)
            setCountdown(null)
          }
          // Reset camera state when switching away from camera tab
          if (value !== "camera") {
            if (cameraStream) {
              cameraStream.getTracks().forEach(track => track.stop())
              setCameraStream(null)
            }
            if (videoRef.current) {
              videoRef.current.srcObject = null
            }
            setIsCameraActive(false)
          }
          // Initialize camera when switching to camera tab
          if (value === "camera" && setupComplete) {
            setIsCameraLoading(true)
            // Small delay to ensure state updates have propagated
            setTimeout(() => {
              initializeCamera()
            }, 100)
          }
        }} 
        defaultValue="frames" 
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="frames">1. Choose Frame</TabsTrigger>
          <TabsTrigger value="camera" disabled={!frameSelected || !setupComplete}>
            2. Take Photos
          </TabsTrigger>
          <TabsTrigger value="strip" disabled={!stripImage}>
            3. View Strip
          </TabsTrigger>
        </TabsList>

        <TabsContent value="frames" className="mt-4">
          <Card>
            <CardContent className="p-6 space-y-6">
              <div className="text-center mb-4">
                <h3 className="text-lg font-semibold mb-1">Step 1: Choose or Upload a Frame</h3>
                <p className="text-muted-foreground text-sm">
                  Select a frame template or upload your own before taking photos
                </p>
              </div>

              {/* Frame selector with template frames */}
              <FrameSelector
                currentFrame={currentFrame}
                customFrames={customFrames}
                onFrameChange={handleFrameChange}
                onDeleteCustomFrame={(index) => {
                  const newCustomFrames = [...customFrames];
                  newCustomFrames.splice(index, 1);
                  setCustomFrames(newCustomFrames);
                  localStorage.setItem("customFrames", JSON.stringify(newCustomFrames));
                }}
              />

              <div className="border-t pt-6">
                <FrameUploader onFrameUpload={handleFrameUpload} />
              </div>

              {customFrames.length > 0 && (
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (confirm("Are you sure you want to clear all custom frames?")) {
                        setCustomFrames([])
                        setCurrentFrame(null)
                        setFrameSelected(false)
                        localStorage.removeItem("customFrames")
                      }
                    }}
                  >
                    Clear All Custom Frames
                  </Button>
                </div>
              )}

              <div className="border-t pt-6 flex justify-center">
                <Button onClick={completeSetup} disabled={!frameSelected} size="lg" className="gap-2">
                  {frameSelected ? <Check className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                  {frameSelected ? "Continue to Photo Booth" : "Please Select a Frame"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="camera" className="mt-4">
          <Card>
            <CardContent className="p-6">
              <div className="text-center mb-4">
                <h3 className="text-lg font-semibold mb-1">Step 2: Take Your Photos</h3>
                <p className="text-muted-foreground text-sm">
                  Using the &quot;
                  {currentFrame ? TEMPLATE_FRAMES.find((f) => f.url === currentFrame)?.name || "Custom" : "selected"}&quot;
                  frame
                </p>
              </div>

              <div className="relative overflow-hidden rounded-lg bg-black md:aspect-[4/3]">
                {/* Mobile container */}
                <div className="md:hidden relative w-full bg-black" style={{ 
                  height: 'calc(100vh - 300px)',
                  minHeight: '400px',
                  maxHeight: '600px'
                }}>
                  <div className="absolute inset-0">
                    {/* Video container */}
                    <div className="absolute inset-0 bg-black">
                      <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        muted 
                        className="absolute inset-0 w-full h-full object-cover"
                        style={{ visibility: currentFilter === 'none' ? 'visible' : 'hidden' }}
                      />
                      <canvas 
                        ref={canvasRef} 
                        className="absolute inset-0 w-full h-full object-cover"
                        style={{ visibility: currentFilter === 'none' ? 'hidden' : 'visible' }}
                      />
                    </div>

                    {/* Debug overlay */}
                    <div className="absolute top-0 left-0 z-30 p-2 bg-black/50 text-white text-xs">
                      <div>Window: {typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'N/A'}</div>
                      <div>Container: {videoRef.current?.parentElement?.offsetWidth}x{videoRef.current?.parentElement?.offsetHeight}</div>
                      <div>Video: {videoRef.current?.offsetWidth}x{videoRef.current?.offsetHeight}</div>
                      <div>Canvas: {canvasRef.current?.offsetWidth}x{canvasRef.current?.offsetHeight}</div>
                    </div>

                    {/* Overlay states */}
                    {isCapturing && countdown !== null && countdown > 0 && (
                      <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/50">
                        <div className="text-white text-7xl font-bold">{countdown}</div>
                      </div>
                    )}

                    {isCameraLoading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20">
                        <div className="text-white">Loading camera...</div>
                      </div>
                    )}

                    {!isCameraActive && !isCameraLoading && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20">
                        <Camera className="h-12 w-12 text-white mb-4" />
                        <p className="text-white mb-4">Camera access is required</p>
                        <Button onClick={initializeCamera} className="gap-2">
                          <Play className="h-4 w-4" />
                          Start Camera
                        </Button>
                      </div>
                    )}

                    {isCapturing && countdown === 0 && (
                      <div className="absolute bottom-0 left-0 right-0 p-4 z-20">
                        <Progress value={(capturedImages.length / 4) * 100} className="h-2" />
                        <p className="text-white text-center mt-2">Taking photo {capturedImages.length + 1} of 4</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Desktop container - no changes */}
                <div className="hidden md:block relative">
                  {isCapturing && countdown !== null && countdown > 0 && (
                    <div
                      className="absolute inset-0 flex items-center justify-center z-10"
                      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
                    >
                      <div className="text-white text-7xl font-bold">{countdown}</div>
                    </div>
                  )}

                  {/* Camera loading state */}
                  {isCameraLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
                      <div className="text-white">Loading camera...</div>
                    </div>
                  )}

                  {/* Camera not started state */}
                  {!isCameraActive && !isCameraLoading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10">
                      <Camera className="h-12 w-12 text-white mb-4" />
                      <p className="text-white mb-4">Camera access is required</p>
                      <Button onClick={initializeCamera} className="gap-2">
                        <Play className="h-4 w-4" />
                        Start Camera
                      </Button>
                    </div>
                  )}

                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    className="w-full h-full object-cover"
                    style={{ visibility: currentFilter === 'none' ? 'visible' : 'hidden' }}
                  />
                  <canvas 
                    ref={canvasRef} 
                    className="absolute inset-0 w-full h-full" 
                    style={{ visibility: currentFilter === 'none' ? 'hidden' : 'visible' }}
                  />

                  {isCapturing && countdown === 0 && (
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <Progress value={(capturedImages.length / 4) * 100} className="h-2" />
                      <p className="text-white text-center mt-2">Taking photo {capturedImages.length + 1} of 4</p>
                    </div>
                  )}
                </div>
              </div>

              {cameraError && (
                <Alert variant="destructive" className="mt-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{cameraError}</AlertDescription>
                </Alert>
              )}

              <div className="mt-4">
                <FilterSelector currentFilter={currentFilter} onFilterChange={handleFilterChange} />
              </div>

              <div className="mt-6 flex justify-center gap-4">
                {!isCameraActive && !isCameraLoading && (
                  <Button onClick={initializeCamera} className="gap-2">
                    <Play className="h-4 w-4" />
                    Start Camera
                  </Button>
                )}

                {isCameraActive && !isCapturing && capturedImages.length === 0 && (
                  <Button onClick={runPhotoSequence} className="gap-2" disabled={isCameraLoading}>
                    <Camera className="h-4 w-4" />
                    Take Photo Strip (4 Photos)
                  </Button>
                )}

                {(isCapturing || capturedImages.length > 0) && !stripImage && (
                  <div className="text-center w-full">
                    {isCapturing ? <p>Taking photos... Please stay still</p> : <p>Creating your photo strip...</p>}
                  </div>
                )}

                {stripImage && (
                  <Button variant="outline" onClick={() => resetCamera()} className="gap-2">
                    <RefreshCw className="h-4 w-4" />
                    New Strip
                  </Button>
                )}
              </div>

              {/* Debug information */}
              {debugInfo && (
                <div className="mt-4 p-2 border border-dashed rounded text-xs text-muted-foreground">
                  <details open>
                    <summary className="cursor-pointer font-bold">Debug Info</summary>
                    <div className="mt-2 space-y-1">
                      <div><strong>Video Stream:</strong> {videoRef.current?.videoWidth}x{videoRef.current?.videoHeight}</div>
                      <div><strong>Video Element:</strong> {videoRef.current?.offsetWidth}x{videoRef.current?.offsetHeight}</div>
                      <div><strong>Canvas Element:</strong> {canvasRef.current?.offsetWidth}x{canvasRef.current?.offsetHeight}</div>
                      <div><strong>Container:</strong> {videoRef.current?.parentElement?.offsetWidth}x{videoRef.current?.parentElement?.offsetHeight}</div>
                      <div><strong>Ready State:</strong> {videoRef.current?.readyState}</div>
                      <div><strong>Playing:</strong> {!videoRef.current?.paused}</div>
                      <div><strong>Error:</strong> {videoRef.current?.error?.message || 'none'}</div>
                      <pre className="mt-2 whitespace-pre-wrap text-xs opacity-75">{debugInfo}</pre>
                    </div>
                  </details>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="strip" className="mt-4">
          {stripImage && (
            <Card>
              <CardContent className="p-6">
                <div className="text-center mb-4">
                  <h3 className="text-lg font-semibold mb-1">Step 3: Your Photo Strip</h3>
                  <p className="text-muted-foreground text-sm">Download or share your completed photo strip</p>
                </div>

                <div className="overflow-hidden rounded-lg mx-auto max-w-md">
                  <img
                    src={stripImage || "/placeholder.svg"}
                    alt="Photo Strip"
                    className="h-full w-full object-contain"
                  />
                </div>
                {uploadStatus && (
                  <div
                    className={`mt-4 p-3 rounded-md text-center ${
                      uploadStatus.includes("successful")
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        : uploadStatus.includes("failed")
                          ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                          : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                    }`}
                  >
                    {uploadStatus}
                  </div>
                )}
                <div className="mt-6 flex justify-center gap-4">
                  <Button variant="outline" onClick={() => resetCamera()} className="gap-2">
                    <RefreshCw className="h-4 w-4" />
                    New Strip
                  </Button>
                  <Button onClick={downloadStrip} className="gap-2">
                    <Download className="h-4 w-4" />
                    Download
                  </Button>
                  <Button
                    onClick={uploadStrip}
                    className="gap-2"
                    disabled={uploadStatus?.includes("successful") || uploadStatus?.includes("Uploading")}
                  >
                    <Upload className="h-4 w-4" />
                    Upload
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

