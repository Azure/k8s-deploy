# Changelog

## [5.0.4] - 2025-08-05

### Added

- #408 [Add missing README.md and action.yml parameters](https://github.com/Azure/k8s-deploy/pull/408)
- #414 [Fix the major update packages including Jest](https://github.com/Azure/k8s-deploy/pull/414)
- #418 [Add husky pre-commit hook.](https://github.com/Azure/k8s-deploy/pull/418)
- #420 [Make namespace input optional](https://github.com/Azure/k8s-deploy/pull/420)
- #424 [add server-side option for kubectl apply commands](https://github.com/Azure/k8s-deploy/pull/424)
- #425 [Add timeout to the rollout status](https://github.com/Azure/k8s-deploy/pull/425)
- #428 [Added additional check in getTempdirectory function](https://github.com/Azure/k8s-deploy/pull/428)
- #432 [Added error check for canary promote actions](https://github.com/Azure/k8s-deploy/pull/432)
- #436 [Add support for ScaledJob](https://github.com/Azure/k8s-deploy/pull/436)
- #440 [Add Enhanced Deployment Error Reporting and Logging](https://github.com/Azure/k8s-deploy/pull/440)
- #441 [Added timeout input description to README](https://github.com/Azure/k8s-deploy/pull/441)

## [5.0.3] - 2025-04-16

### Added

- #398 case-insensitive resource type

## [5.0.2] - 2025-04-15

### Added

- #396 Update new resource-type input for action

## [5.0.1] - 2024-03-12

### Added

- #356 Add fleet support

## [5.0.0] - 2024-03-12

### Changed

- #309 Updated to Node20 and upgraded release workflows to @v1 tag
- #306 update release workflow to use new prefix, remove deprecated release
- #303 fix: ensure imageNames are not empty strings
- #299 bump release workflow sha
- #298 bump minikube to fix runner deps
- #297 update release workflow

### Added

- #304 add v prefix for version tagging
- #302 adding ncc to build
- #301 adding release workflow artifact fix

## [4.10.0] - 2023-10-30

### Added

- #287 Make annotating resources optional
- #283 Fix “Service” route-method of the Blue-Green strategy with some manifest files
- #281 bump codeql to node 16
- #279 upgrade codeql
- #276 Fixes multiple namespaces bug
