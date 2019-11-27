import { Route } from 'front-end/lib/app/types';
import { Router } from 'front-end/lib/framework';

export function pushState(route: Route) {
  if (window.history && window.history.pushState) {
    const path = router.routeToUrl(route);
    window.history.pushState({ path }, '', path);
  }
}

export function replaceState(route: Route) {
  if (window.history && window.history.replaceState) {
    const path = router.routeToUrl(route);
    window.history.replaceState({ path }, '', path);
  }
}

export function redirect(path: string) {
  window.location.href = `${window.location.origin}/${path}`;
}

const router: Router<Route> = {

  routes: [
    {
      path: '/',
      makeRoute() {
        return {
          tag: 'hello',
          value: null
        };
      }
    },
    {
      path: '/sign-out',
      makeRoute() {
        return {
          tag: 'signOut',
          value: null
        };
      }
    },
    {
      path: '/notice/auth-failure',
      makeRoute() {
        return {
          tag: 'notice',
          value: {
            noticeId: {
              tag: 'authFailure',
              value: undefined
            }
          }
        };
      }
    },
    {
      path: '*',
      makeRoute() {
        return {
          tag: 'notice',
          value: {
            noticeId: {
              tag: 'notFound',
              value: undefined
            }
          }
        };
      }
    }
  ],

  routeToUrl(route) {
    switch (route.tag) {
      case 'hello':
        return '/';
      case 'signOut':
        return '/sign-out';
      case 'notice':
        return (() => {
          switch (route.value.noticeId.tag) {
            case 'notFound':
              return '/not-found';
            case 'authFailure':
              return '/notice/auth-failure';
          }
        })();
    }
  }

};

export default router;
