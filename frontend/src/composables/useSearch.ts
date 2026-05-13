import { ref, computed, watch } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import debounce from 'lodash.debounce'
import { axiosApi } from '../api/axios'
import type { iTask } from '../types/taskTypes'

export interface SearchFilters {
  query: string
  fields: Record<string, string>
}

export interface SearchResult {
  tasks: iTask[]
  total: number
  page: number
  limit: number
  agentGroups?: Record<string, iTask[]>
}

export interface UseSearchOptions {
  projectId?: number | string
}

export function useSearch(options: UseSearchOptions = {}) {
  const { projectId } = options

  const searchQuery = ref('')
  const debouncedQuery = ref('')
  const isOverlayOpen = ref(false)
  const currentPage = ref(1)
  const limit = ref(50)

  // Parse search query into field filters
  function parseQuery(raw: string): SearchFilters {
    const filters: Record<string, string> = {}
    
    const fieldValueRegex = /(\w+):\s*("[^"]+"|\S+)/g
    let match
    
    while ((match = fieldValueRegex.exec(raw)) !== null) {
      const field = match[1].toLowerCase()
      let value = match[2]
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1)
      }
      filters[field] = value
    }
    
    const remaining = raw.replace(fieldValueRegex, '').trim()
    if (remaining) {
      filters._general = remaining
    }
    
    return { query: raw, fields: filters }
  }

  // Fetch search results
  async function fetchSearchResults(q: string, page: number): Promise<SearchResult> {
    if (!q.trim()) {
      return { tasks: [], total: 0, page: 1, limit: limit.value }
    }

    const params: Record<string, unknown> = {
      q,
      page,
      limit: limit.value,
    }

    if (projectId != null) {
      params.projectId = Number(projectId)
    }

    const response = await axiosApi.get('/search', { params })
    return response.data as SearchResult
  }

  // Debounced search query (300ms delay)
  const debouncedUpdate = debounce((value: string) => {
    debouncedQuery.value = value
  }, 300)

  // Watch searchQuery and update debouncedQuery after delay
  watch(searchQuery, (newValue) => {
    debouncedUpdate(newValue)
  })

  // Debounced search with Vue Query
  const parsedFilters = computed(() => parseQuery(debouncedQuery.value))

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: computed(() => ['tasks', 'search', parsedFilters.value.query, currentPage.value, projectId]),
    queryFn: () => fetchSearchResults(parsedFilters.value.query, currentPage.value),
    enabled: computed(() => debouncedQuery.value.trim().length > 0),
    staleTime: 30_000,
  })

  // Watch for query changes and reset page
  watch(searchQuery, () => {
    currentPage.value = 1
  })

  // Computed properties
  const results = computed(() => data.value?.tasks ?? [])
  const total = computed(() => data.value?.total ?? 0)
  const totalPages = computed(() => Math.ceil(total.value / limit.value))
  const hasResults = computed(() => results.value.length > 0)
  const hasSearch = computed(() => searchQuery.value.trim().length > 0)

  // Actions
  function search(query: string) {
    searchQuery.value = query
    if (query.trim()) {
      isOverlayOpen.value = true
    }
  }

  function clearSearch() {
    searchQuery.value = ''
    currentPage.value = 1
    isOverlayOpen.value = false
  }

  function openOverlay() {
    isOverlayOpen.value = true
  }

  function closeOverlay() {
    isOverlayOpen.value = false
  }

  function goToPage(page: number) {
    currentPage.value = page
  }

  function goToNextPage() {
    if (currentPage.value < totalPages.value) {
      currentPage.value++
    }
  }

  function goToPrevPage() {
    if (currentPage.value > 1) {
      currentPage.value--
    }
  }

  return {
    // State
    searchQuery,
    isOverlayOpen,
    currentPage,
    limit,
    
    // Data
    results,
    total,
    totalPages,
    hasResults,
    hasSearch,
    
    // Query state
    isLoading,
    isError,
    error,
    
    // Methods
    parseQuery,
    search,
    clearSearch,
    openOverlay,
    closeOverlay,
    goToPage,
    goToNextPage,
    goToPrevPage,
    refetch,
  }
}
