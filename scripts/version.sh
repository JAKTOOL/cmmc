#! /usr/bin/env bash

pushd client

VERSION=$(npm version "$1" | tr -d 'v')
git add .
git commit -m "$VERSION"
git tag "$VERSION" -m "$VERSION"
git push --follow-tags

popd

