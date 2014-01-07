#!/bin/sh

appname=openshortcuts

cp buildscript/makexpi.sh ./
./makexpi.sh -n $appname -o
rm ./makexpi.sh
