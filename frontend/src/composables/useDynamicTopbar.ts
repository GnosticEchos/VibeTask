import BoardTopbar from '../components/layout/topbar/variants/BoardTopbar.vue'
import DefaultTopbar from '../components/layout/topbar/variants/DefaultTopbar.vue'
import ExploreTopbar from '../components/layout/topbar/variants/ExploreTopbar.vue'
import { useRoute } from 'vue-router'

export function component() {
  const route = useRoute()
  const routeName = String(route?.name || '')

  const componentMap: Record<string, any> = {
    Explore: ExploreTopbar,
    Board: BoardTopbar,
    SubBoard: BoardTopbar,
    ProjectGrid: BoardTopbar,
    ProjectDocs: BoardTopbar,
  }

  return componentMap[routeName] || DefaultTopbar
}
