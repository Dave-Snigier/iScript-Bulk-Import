#!/bin/bash
set -o errexit

### --- Settings --- ###
#fileCompleteFlag="file_done"
alertEmail="user@umass.edu"

### --- Libraries and functions --- ###

# Locking library (NFS safe)
source "/export/$(hostname -s)/inserver6/script/lib/MutexLock-Library.sh"

# attempt to get a lock on the process
new MutexLock padlock "import-AD-Databank.sh"
padlock.lock 2


### --- main script --- ###

# get environment abreviation (DEV|TST\PRD)
hostAbrev="$(hostname)"
hostAbrev="${hostAbrev:2:3}"
hostAbrev="$(echo ${hostAbrev} | tr '[:lower:]' '[:upper:]')"
errorCode="0"

# build working path
inputDirectory="/di_interfaces/DI_${hostAbrev}_DATABANK_AD_INBOUND"
cd "${inputDirectory}"

echo "got lock"


# If the file copy flag doesn't exist then exist the script
if [[ ! -e "$fileCompleteFlag" ]]; then
	echo "no flag"
	padlock.release
	exit 140
fi

find . -maxdepth 1 -type f -name "*.zip" -print0 | while IFS= read -rd $'\0' f ; do
	filename=$(basename "$f")
	filename="${filename%.*}"

	unzipDir="1_unzip/${filename}"

	echo $filename
	echo $unzipDir

	if ! unzip -t -q "${f}"; then 
		echo "could not unzip file [${f}]. It has been moved to the error directory" |
			mailx -s "[DI ${hostAbrev} Error] Databank Import Error" ${alertEmail}
		rm -r "${unzipDir}"
		mv "${f}" "error"
		errorCode="1"
	else
		unzip -q -d "${unzipDir}" "${f}"
		mv "${f}" "archive"
	fi
done

if [ $errorCode -eq 0 ] ; then
	rm "${fileCompleteFlag}"
fi

rm "${fileCompleteFlag}"


cd /export/$(hostname -s)/inserver6/script

#crap from setenv.sh
MACH_OS=`uname -s`
CURRENTDIR=`pwd`
cd ..
IMAGENOWDIR6=`pwd`
cd $CURRENTDIR
ODBCINI=$IMAGENOWDIR6/etc/odbc.ini
LD_LIBRARY_PATH=$IMAGENOWDIR6/odbc/lib:$IMAGENOWDIR6/bin:$IMAGENOWDIR6/fulltext/k2/_ilnx21/bin:/usr/local/waspc6.5/lib:/usr/lib
PATH=$PATH:$IMAGENOWDIR6/fulltext/k2/_ilnx21/bin:$IMAGENOWDIR6/bin
IMAGE_GEAR_PDF_RESOURCE_PATH=./Resource/PDF/
IMAGE_GEAR_PS_RESOURCE_PATH=./Resource/PS/
IMAGE_GEAR_HOST_FONT_PATH=./Resource/PS/Fonts/

export IMAGENOWDIR6 ODBCINI LD_LIBRARY_PATH PATH IMAGE_GEAR_PDF_RESOURCE_PATH IMAGE_GEAR_PS_RESOURCE_PATH IMAGE_GEAR_HOST_FONT_PATH


intool --cmd run-iscript --file UMBUA_Databank_Import.js



# cleanup
padlock.release

exit ${errorCode}
