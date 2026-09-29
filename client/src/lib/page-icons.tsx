import React from 'react'
import checkoutIcon from '@/assets/icons/shopping-cart-checkout.svg'
import inventoryIcon from '@/assets/icons/inventory-filled.svg'
import productsIcon from '@/assets/icons/products-gifts-bold.svg'
import dashboardIcon from '@/assets/icons/dashboard-ops-duotone-regular.svg'
import salesIcon from '@/assets/icons/sales-ops.svg'
import homeIcon from '@/assets/icons/home-outline-rounded.svg'
import storesIcon from '@/assets/icons/store-rounded.svg'
import promotionsIcon from '@/assets/icons/badge-promotion-filled.svg'
import stockRequestsIcon from '@/assets/icons/request-duotone-regular.svg'
import auditIcon from '@/assets/icons/audit-duotone-bold.svg'
import usersIcon from '@/assets/icons/users.svg'
import rolesIcon from '@/assets/icons/roles.svg'

export const PAGE_ICONS: Record<string, string> = {
  checkout: checkoutIcon,
  inventory: inventoryIcon,
  products: productsIcon,
  dashboard: dashboardIcon,
  sales: salesIcon,
  home: homeIcon,
  stores: storesIcon,
  promotions: promotionsIcon,
  'stock-requests': stockRequestsIcon,
  audit: auditIcon,
  users: usersIcon,
  roles: rolesIcon,
}

export const PageIcon: React.FC<{
  name: string
  className?: string
}> = ({ name, className = 'w-5 h-5 object-contain shrink-0' }) => {
  const iconSrc = PAGE_ICONS[name]
  if (!iconSrc) return null
  return <img src={iconSrc} alt={name} className={className} />
}
