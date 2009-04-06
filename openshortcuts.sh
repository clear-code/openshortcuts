#!/bin/sh

appname=${0##*/}
appname=${appname%.sh}

cp buildscript/make_new.sh ./
make_new.sh $appname version=1
rm make_new.sh
