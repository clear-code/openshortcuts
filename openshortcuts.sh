#!/bin/sh

appname=${0##*/}
appname=${appname%.sh}

cp buildscript/makexpi.sh ./
./makexpi.sh -n $appname -v
rm ./makexpi.sh
