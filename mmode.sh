#!/bin/bash
if [ -z $1 ]; then
echo "exiting"
exit
fi

cd /tmp/
FOLDER=$1
X1=$2
Y1=$3
X2=$4
Y2=$5
NEWNAME=$7
ANGLE=$(echo - | awk "{print 180*atan2($X2-$X1,$Y2-$Y1)/3.14159265359}")
#echo "$X1, $Y1, $X2, $Y2, $ANGLE"
NAMEONLY=$(basename $6)
ORIGINAL="${NAMEONLY%.*}"
TEMPDIR=/tmp/$FOLDER
#NEWNAME=$(perl -e 'print int rand 100000, "\n"; ')
#echo $NAMEONLY
#if [ -e results/$ORIGINAL.png ]; then
#   rm results/$ORIGINAL.png
#fi
if [ -d $TEMPDIR ]; then
   rm -rf $TEMPDIR
fi
mkdir $TEMPDIR
mkdir $TEMPDIR/poster
DESTDIR="/var/www/uploads/$FOLDER"
#echo $DESTDIR
ffmpeg -i "$DESTDIR/$NAMEONLY" -f image2 -qscale:v 2 -q:v 1 -y $TEMPDIR/%05d.png 2>&1 | grep sakjhdskjdsjh
#echo "stills made"
cp $TEMPDIR/00001.png $TEMPDIR/poster/
convert -strokewidth 3  -stroke white -draw "line $X1,$Y1,$X2,$Y2" $TEMPDIR/poster/00001.png $TEMPDIR/poster/00001.png
convert -resize x200 $TEMPDIR/poster/00001.png $TEMPDIR/poster/00001.png
#mogrify -strokewidth 3  -stroke white -draw "line $X1,$Y1,$X2,$Y2" $TEMPDIR/*.png
OFFSET=$(convert $TEMPDIR/poster/00001.png +distort SRT "$X1, $Y1, $ANGLE" -format "%X" -write info: +repage $TEMPDIR/poster/rotated.png)
NEWXLOC=$((X1-OFFSET-1))
mogrify -virtual-pixel black +distort SRT "$X1, $Y1, $ANGLE"  +repage -crop "3x2500+$NEWXLOC-1+0" $TEMPDIR/*.png


convert +append $TEMPDIR/*.png $DESTDIR/$NEWNAME
cp $DESTDIR/$NEWNAME $TEMPDIR/poster/00002.png
convert -gravity center -background black -interlace Line  -quality 100% -append -trim -fuzz 10% +repage $DESTDIR/$NEWNAME $TEMPDIR/poster/00001.png $DESTDIR/$NEWNAME
#convert results/$NEWNAME.png -trim -fuzz 10% +repage results/$NEWNAME.png
rm -rf $TEMPDIR
echo -e "$NEWNAME"
