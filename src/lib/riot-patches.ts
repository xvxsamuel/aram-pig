/**
 * Fetches the latest patch versions from Riot's Data Dragon API
 * Converts API patch format (15.x.x) to ARAM PIG format (25.x)
 */
export async function getLatestPatches(): Promise<string[]> {
  try {
    const response = await fetch('https://ddragon.leagueoflegends.com/api/versions.json', {
      next: { revalidate: 3600 } // Cache for 1 hour
    })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch versions: ${response.status}`)
    }
    
    const versions: string[] = await response.json()
    
    // Take first 3 versions and convert them
    // Example: "15.1.1" -> "25.1"
    const patches = versions.slice(0, 3).map(version => {
      const parts = version.split('.')
      const major = parseInt(parts[0])
      const minor = parts[1]
      
      // Convert 15.x -> 25.x (Riot's API year offset)
      const convertedMajor = major + 10
      
      return `${convertedMajor}.${minor}`
    })
    
    return patches
  } catch (error) {
    console.error('Failed to fetch latest patches:', error)
    // Fallback to hardcoded recent patches if API fails
    return ['25.1', '24.24', '24.23']
  }
}
