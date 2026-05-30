#!/bin/bash
if [ -z $1 ]; then
echo "exiting"
exit
fi

X1=$1
Y1=$2
X2=$3
Y2=$4
INFILE=$5
OUTFILE=$6
IMGMGK=$7
POSTERBIG=$8
"$IMGMGK" convert -strokewidth 3  -stroke white -draw "line $X1,$Y1,$X2,$Y2" $INFILE $POSTERBIG
"$IMGMGK" convert -resize 250x $POSTERBIG $OUTFILE
