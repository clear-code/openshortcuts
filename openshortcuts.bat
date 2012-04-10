set appname=%~n0

copy buildscript\makexpi.sh .\
bash makexpi.sh -n %appname% -v
del makexpi.sh
