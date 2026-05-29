import { ref, computed, watch, unref, type MaybeRef } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import debounce from 'lodash.debounce'
import { axiosApi } from '../api/axios'

export interface DocumentSearchResult {
  id: number
  title: string
  docType: string
  projectId: number
  createdAt: string
  updatedAt: string
  rank: number
  snippet: string
  createdBy: {
    id: number
    name: string
    surname: string
  } | null
}

export interface DocumentSearchResponse {
  data: DocumentSearchResult[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface UseDocumentSearchOptions {
  projectId: MaybeRef<number | string>
}

export function useDocumentSearch(options: UseDocumentSearchOptions) {
  const projectId = computed(() => unref(options.projectId))

  const searchQuery = ref('')
  const debouncedQuery = ref('')
  const isOverlayOpen = ref(false)
  const currentPage = ref(1)
  const limit = ref(25)

  // Debounced search query (300ms delay)
  const debouncedUpdate = debounce((value: string) => {
    debouncedQuery.value = value
  }, 300)

  // Watch searchQuery and update debouncedQuery after delay
  watch(searchQuery, (newValue) => {
    debouncedUpdate(newValue)
  })

  // Fetch search results
  async function fetchSearchResults(q: string, page: number): Promise<DocumentSearchResponse> {
    if (!q.trim()) {
      return { data: [], pagination: { page: 1, limit: limit.value, total: 0, totalPages: 0 } }
    }

    const params = {
      q,
      page,
      limit: limit.value,
    }

    const response = await axiosApi.get(`/projects/${projectId.value}/docs/search`, { params })
    return response.data as DocumentSearchResponse
  }

  // Vue Query for search
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: computed(() => ['documents', 'search', projectId.value, debouncedQuery.value, currentPage.value]),
    queryFn: () => fetchSearchResults(debouncedQuery.value, currentPage.value),
    enabled: computed(() => debouncedQuery.value.trim().length > 0),
    staleTime: 30_000,
  })

  // Watch for query changes and reset page
  watch(searchQuery, () => {
    currentPage.value = 1
  })

  // Computed properties
  const results = computed(() => data.value?.data ?? [])
  const total = computed(() => data.value?.pagination.total ?? 0)
  const totalPages = computed(() => data.value?.pagination.totalPages ?? 0)
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
