import {createRouter, createWebHistory, type RouteRecordRaw} from 'vue-router'
import {RouterToListItem} from "@/utils/tools.ts"
import type {NewRouteRecord, RouteRecord} from "@/types/index.ts"
import {getPlugins} from "@/utils/router.ts";


export const defaultRouters: RouteRecord[] = [
    {
        path: '/',
        component: () => import('@/view/layout/index.vue'),
        redirect: {name: "home"},
        name: 'layout',
        children: [
            {
                path: '/home',
                component: () => import('@/view/home/index.vue'),
                name: 'home',
                meta: {
                    title: "Home",
                    icon: 'HomeFilled',
                    componentName: 'Home',
                },
            },
            {
                path: '/dashboard',
                component: () => import('@/view/dashboard/index.vue'),
                name: 'dashboard',
                meta: {
                    title: "Dashboard",
                    icon: 'HomeFilled',
                    componentName: 'Dashboard',
                },
            },
            {
                path: '/plugin',
                component: () => import('@/view/plugin/index.vue'),
                name: 'plugin',
                meta: {
                    title: "Plugin",
                    icon: 'HomeFilled',
                    componentName: 'Plugin',
                },
            },
        ]
    },
    {
        path: '/mapIndex',
        component: () => import('@/view/map/index.vue'),
        redirect: {name: "ixMap3D"},
        name: 'mapIndex',
        children: [
            {
                path: '/uploadMap',
                component: () => import('@/view/map/uploadMap/uploadMap.vue'),
                name: 'uploadMap',
                meta: {
                    title: "UploadMap",
                    icon: 'HomeFilled',
                    componentName: 'UploadMap',
                },
            },
            {
                path: '/ixMap3D',
                component: () => import('@/view/map/ixMap3D/ixMap3D.vue'),
                name: 'ixMap3D',
                meta: {
                    title: "IXMap3D",
                    icon: 'HomeFilled',
                    componentName: 'IXMap3D',
                },
            },
        ]
    },
    {
        path: '/console',
        component: () => import('@/view/console/index.vue'),
        name: 'console',
        meta: {
            title: "Console",
            icon: 'HomeFilled',
            componentName: 'Console',
        },
    },
    {
        path: '/:pathMatch(.*)*',
        component: () => import('@/view/404/index.vue'),
        name: '404',
        meta: {
            title: '404',
            componentName: 'NotFound',
        }
    },
]

export const routerList: NewRouteRecord[] = RouterToListItem(defaultRouters)

export const createAppRouter = async () => {

    const pluginRoutes = getPlugins().flatMap(
        plugin => plugin.routes || []
    )

    return createRouter({
        history: createWebHistory(
            import.meta.env.VITE_FRONTEND_URL_PREFIX
        ),

        routes: [
            ...defaultRouters,
            ...pluginRoutes,
        ] as RouteRecordRaw[],

        scrollBehavior() {
            return {
                left: 0,
                top: 0,
            }
        },
    })
}
